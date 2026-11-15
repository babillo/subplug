// OpenNext turns the Next.js build into a Cloudflare Worker. Every page is personal and rendered
// per request, so no page cache is configured.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});
