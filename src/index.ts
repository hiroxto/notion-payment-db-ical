import { Client } from "@notionhq/client";
import { Hono, type MiddlewareHandler } from "hono";
import ical, { type ICalEventData } from "ical-generator";
import { z } from "zod";

const app = new Hono<{ Bindings: CloudflareBindings }>();

const authMiddleware: MiddlewareHandler<{ Bindings: CloudflareBindings }> = async (c, next) => {
  const apiKey = c.req.query("sk");
  if (apiKey !== c.env.AUTH_KEY) {
    return c.text("Unauthorized", 401);
  }
  await next();
};

const formatableTextScheme = z.array(
  z.object({
    type: z.string(),
    text: z.object({
      content: z.string(),
      link: z
        .object({
          url: z.url(),
        })
        .nullable(),
    }),
    plain_text: z.string(),
    href: z.url().nullable(),
  }),
);
const paymentDbScheme = z.object({
  object: z.string(),
  results: z.array(
    z.object({
      id: z.string(),
      properties: z.object({
        "Campaign Name": z.object({
          title: formatableTextScheme,
        }),
        Description: z.object({
          rich_text: formatableTextScheme,
        }),
        Date: z.object({
          formula: z.object({
            date: z.object({
              start: z.string(),
              end: z.string().nullable(),
            }),
          }),
        }),
      }),
      url: z.url(),
    }),
  ),
});

app.get("/:data_source_id/ical", authMiddleware, async c => {
  const notion = new Client({
    auth: c.env.NOTION_AUTH,
    notionVersion: "2025-09-03",
    fetch: (url, options) => fetch(url, options),
  });

  const response = await notion.dataSources.query({
    data_source_id: c.req.param("data_source_id"),
    filter: {
      or: [
        {
          property: "Status",
          formula: {
            string: {
              equals: "開始前",
            },
          },
        },
        {
          property: "Status",
          formula: {
            string: {
              equals: "期間内",
            },
          },
        },
      ],
    },
    sorts: [
      {
        property: "Date",
        direction: "ascending",
      },
    ],
  });

  const results = paymentDbScheme.parse(response);
  const calendar = ical({
    name: "還元系カレンダー",
    description: "Notionの還元系カレンダーをiCalに変換したカレンダー",
    timezone: "Asia/Tokyo",
    ttl: 60 * 60 * 6, // 6 hours
  });

  for (const result of results.results) {
    const campaignName = result.properties["Campaign Name"].title.map(t => t.plain_text).join("");
    const descriptionText = result.properties.Description.rich_text.map(t => t.plain_text).join("");

    const eventDetails: ICalEventData = {
      id: result.id,
      start: new Date(result.properties.Date.formula.date.start),
      summary: campaignName,
      description: `${descriptionText}\n${result.url}`,
      allDay: true,
    };

    const endDateString = result.properties.Date.formula.date.end;
    if (endDateString) {
      const end = new Date(endDateString);
      end.setDate(end.getDate() + 1); // Add one day for all-day events
      eventDetails.end = end;
    }
    calendar.createEvent(eventDetails);
  }

  return new Response(calendar.toString(), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
    },
  });
});

app.all("/", async c => {
  return c.text("Not found", 404);
});

app.all("/*", async c => {
  return c.text("Not found", 404);
});

export default app;
