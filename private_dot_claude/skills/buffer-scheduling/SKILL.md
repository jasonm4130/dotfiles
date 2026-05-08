---
description: >
  Schedule social media posts (LinkedIn + Twitter primarily) via Buffer using
  the Buffer MCP server. Captures the multi-step pattern for scheduling with
  custom dueAt times AND attaching LinkedIn first comments — which the
  create_post tool does NOT expose directly. Use when the user asks to schedule
  Buffer posts, especially blog companion posts that need a firstComment for
  the link.
  Triggers: "schedule with buffer", "schedule buffer post", "schedule linkedin
  twitter", "buffer first comment", "publish to buffer", "schedule the social
  posts".
---

# Buffer Scheduling

You're scheduling social media posts via the Buffer MCP server. Cover the
LinkedIn + Twitter happy path and avoid the two known gotchas: Twitter's
280-char limit and the LinkedIn `firstComment` two-step pattern.

## Inputs to confirm with the user before scheduling

1. **Post copy** for each channel (LinkedIn body, Twitter body, LinkedIn first comment text)
2. **Publish date and time** — usually a Tuesday morning Brisbane time for Jason's content cadence
3. **Channel target** — confirm which Buffer channels (Jason has one LinkedIn + one Twitter)

If any of these are missing or ambiguous, ask BEFORE calling Buffer tools.
Scheduled posts can be edited but each round-trip costs time.

## Step 1: Get account and channels

Always start fresh with the live API. Don't hard-code channel IDs — Buffer
reissues them occasionally, and channel sets change.

```
mcp__buffer__get_account
```

Use the response to get:
- `organizations[0].id` — pass to list_channels
- `timezone` — used to construct `dueAt` ISO offsets

```
mcp__buffer__list_channels(organizationId)
```

Pick the right channels by `service` (`linkedin` / `twitter`) and `name`.

For Jason's setup specifically (as of 2026-04-26):
- Org: "My Organization" (single)
- LinkedIn: `jasonmatthew-engineering` (Jason Matthew profile)
- Twitter: `jasonm4130`
- Timezone: Australia/Brisbane (AEST, +10:00 year-round, no DST)

## Step 2: Create the posts

Use `mcp__buffer__create_post` for each channel with:
- `channelId` — exact ID from list_channels
- `text` — post body
- `mode` — `customScheduled` for specific times, `addToQueue` for next available slot
- `dueAt` — ISO 8601 with timezone offset, e.g. `2026-05-12T10:00:00+10:00`
- `schedulingType` — `automatic` (auto-publish) or `notification` (manual approval)

Default for Jason: `customScheduled` + `automatic`.

### Twitter 280-char limit

Buffer's validator enforces 280 chars regardless of any X Premium status.
URLs count as 23 chars (t.co shortener length, even if the actual URL is longer).

If the copy goes over:
1. **Trim first** — single-tweet copy outperforms threads for blog-companion posts
2. **Or use a thread** via `metadata.twitter.thread` array if the message genuinely needs more space

Common trim moves: cut "Amazon" or "AWS " prefixes, drop conversational filler ("we were running" → "we ran"), remove redundant qualifiers.

### LinkedIn body convention

Body text references the link as **"Link in comments"** (Jason's pattern, avoids in-body link algorithm penalty). The actual URL goes in the `firstComment` via the next step.

### Default Brisbane schedule slots for Jason

- Twitter: 09:00 AM AEST (`T09:00:00+10:00`)
- LinkedIn: 10:00 AM AEST (`T10:00:00+10:00`)

The 1-hour stagger is intentional per the LinkedIn Strategy SOP.

## Step 3: Set the LinkedIn firstComment (the gotcha)

The `mcp__buffer__create_post` tool **does NOT expose `firstComment`** even though it's a real field on the underlying post. To set it, use `mcp__buffer__execute_mutation` with the `editPost` mutation.

**Critical:** The `editPost` mutation requires `text` to be passed even on metadata-only updates, otherwise it errors with `"Post must have either text or media."` Always pass the full body text again, plus the existing `mode` and `dueAt` to preserve scheduling.

### Mutation template

```graphql
mutation SetFirstComment($input: EditPostInput!) {
  editPost(input: $input) {
    __typename
    ... on PostActionSuccess {
      post {
        id
        metadata {
          ... on LinkedInPostMetadata { firstComment }
        }
      }
    }
    ... on InvalidInputError { message }
    ... on UnexpectedError { message }
    ... on NotFoundError { message }
    ... on UnauthorizedError { message }
  }
}
```

### Variables template

```json
{
  "input": {
    "id": "<post-id returned by create_post>",
    "schedulingType": "automatic",
    "mode": "customScheduled",
    "dueAt": "<same ISO datetime as create_post>",
    "text": "<EXACT full body text passed to create_post>",
    "metadata": {
      "linkedin": {
        "firstComment": "<text including the URL>"
      }
    }
  }
}
```

`firstComment` is what publishes as a comment under the LinkedIn post authored by Jason once the post goes live. Keep it short — typically `"Full write-up: <URL>"` or `"<short framing>: <URL>"`.

## Step 4: Verify

Optional but recommended: call `mcp__buffer__get_post` for each scheduled post to confirm:
- `status: scheduled`
- `dueAt` matches expected ISO time
- For LinkedIn: `metadata.firstComment` is the URL string (not `null`)

## Step 5: Record in the vault

Update the current quarter's scheduled-posts file:

```
~/Documents/Obsidian Vault/Areas/Professional/Career Resilience/LinkedIn/Scheduled Posts - <Quarter>.md
```

Capture per post:
- Title, publish date, bucket (Builder / Leader / Curator)
- Both Buffer post IDs
- Both bodies (LinkedIn full, Twitter full)
- The `firstComment` text (LinkedIn)
- Any open items (e.g. "needs Squiz comms review before publish")

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `"Twitter / X posts cannot exceed 280 characters"` | Body too long for X | Trim or thread |
| `"Post must have either text or media"` on editPost | Missing `text` in mutation input | Always pass `text` + mode + dueAt + schedulingType, even for metadata-only edits |
| `"Cannot query field firstComment on type PostMetadata"` | Missing inline fragment in response selection | Use `... on LinkedInPostMetadata { firstComment }` |
| `"Cannot query field id on type PostActionPayload"` | `editPost` returns a union, not a direct Post | Use `... on PostActionSuccess { post { id ... } }` |
| `firstComment` shows `null` after create_post | Expected — `create_post` MCP tool doesn't expose it | Run the editPost mutation step |
| Post scheduled but at wrong time | Forgot the timezone offset in `dueAt` | Always use ISO 8601 with explicit offset (`+10:00` for Brisbane), never naive UTC |

## Out of scope for this skill

- Bulk scheduling many posts (use Buffer's queue + `addToQueue` mode, not customScheduled)
- Image/video/document assets (use `mcp__buffer__create_post`'s `assets` parameter; this skill stays focused on text-with-link posts)
- Monthly content calendar planning (that's the LinkedIn Strategy SOP work, lives in the vault)
- Cross-posting to other platforms (Threads, Mastodon, etc. — adapt patterns from this skill)
