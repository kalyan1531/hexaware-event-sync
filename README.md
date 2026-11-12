# Event Sync Service

A local, read-only meeting view built from the supplied CRM and calendar snapshots. The service loads both JSON files at startup and serves the unified list and its source records through a REST endpoint.

## Run locally

1. Extract the ZIP and open a terminal in the folder containing server.js.
2. Install Node.js 20 or newer if needed. Check with node --version.
3. Run **node server.js**. The project uses Node's standard library and requires no package installation. **npm start** is equivalent if npm is available.
4. Open [the meeting list](http://127.0.0.1:3000/). Expand a row to view source differences, provenance, matching evidence, and the original records. The checkbox filters to meetings with differences.
5. Run **node --test** to check the supplied fixtures. Stop the server with Ctrl+C. Restart it after changing either data file.

The server binds to loopback and uses port 3000 by default. In PowerShell, set a different port with **$env:PORT = '3001'** before starting it.

## API

**GET /api/meetings** returns an object with a meetings array. Each item contains:

- **id** — the contributing source IDs joined with a plus sign for a matched pair.
- **fields** — normalized display fields, each with a value and its source.
- **conflicts** — field names and both values where comparable populated values differ, plus a format difference for an in-person CRM entry with a virtual calendar location.
- **sources** — the original CRM and calendar records, source IDs, and normalization issues. A missing source is null.
- **evidence** — the signals used for a matched pair.

For example, in PowerShell run **Invoke-RestMethod http://127.0.0.1:3000/api/meetings**. The supplied 20 CRM and 22 calendar records yield 17 matched pairs, three CRM-only meetings, and five calendar-only meetings.

## Reconciliation decisions

- **Dates and time.** Compare timestamps in America/New_York. Offset-free input is interpreted as Eastern wall-clock time because several supplied locations are in the eastern US. Explicit offsets are converted with daylight saving rules. Crestview's 19:00 UTC becomes 15:00 Eastern, one hour after the CRM time. The differing start times remain visible. A CRM date with US month/day/year ordering and mixed separators is repaired when it forms a valid date. A missing time stays unknown unless a matched source supplies it.
- **Candidate selection.** Start with records on the same normalized date. For client meetings, require a client-name match to an attendee email handle and an owner match to the organizer. Allow up to 60 minutes of drift, or up to 120 minutes or an unknown time when the titles share a meaningful word. Internal meetings require starts within 15 minutes, at least two shared title words, and a common organizer/owner or exact location. The group dinner rule requires a matching owner, exact start, and two shared title words. A small acronym map covers terms such as LPAC and QBR.
- **Competing matches.** Process higher scores first. Exact or close starts, title overlap, and a shared location raise the score. Each source row can contribute to at most one pair. Skip equally scored candidates that share an endpoint. This greedy approach is explainable on these fixtures and can miss the best global assignment with denser inputs.
- **Possible duplicates.** Keep both Pinnacle calendar entries. The 11:00 event wins the CRM match, while the 11:30 event differs in start, attendees, title, and location. A person or company appearing twice is insufficient to collapse two calendar events. Keep recurring occurrences on distinct dates.
- **Conflicts and provenance.** Prefer Calendar for shared display fields and fall back to CRM when Calendar lacks a value. Preserve both source records. The confirmed Calendar status on Board Prep appears beside CRM's cancelled status in the differences panel. Keep missing values distinct from conflicts. The attendee list used for matching excludes malformed addresses, while the original record and issue remain visible.
- **Limits.** The data files act as local upstream snapshots. The service takes a fresh snapshot on restart. The matching windows and Eastern time assumption would need validation against upstream metadata before broader use. The location comparison surfaces differences even when two strings might describe the same room.

## Time and AI assistance

Codex implemented and verified this draft on the local machine. See AI_NOTES.md for the development decisions made with AI assistance. The candidate should add their own actual review and development time before submitting.

Measured AI implementation and verification time was approximately two minutes, based on elapsed local time from project setup through packaging. This excludes earlier discussion and the candidate's review time.
