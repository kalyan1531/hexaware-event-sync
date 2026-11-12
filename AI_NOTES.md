# AI collaboration notes

The candidate asked Codex to implement the supplied assessment on their computer. Codex inspected both fixture files, proposed the matching rules, authored the Node.js service and frontend, wrote the README, and verified the draft.

The planning discussion identified three important examples. Summit's CRM and Calendar locations should be visible side by side. The Pinnacle records warrant a one-to-one CRM match while retaining the other Calendar entry. A missing CRM start should stay unknown until independent evidence links the record to a Calendar entry. The implementation also explicitly chose US Eastern time as the working assumption for offset-free values and checked Crestview's UTC conversion against daylight saving time.

Verification covered five automated tests, the live API response, and the Summit details in Microsoft Edge.
