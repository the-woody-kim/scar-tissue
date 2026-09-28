// No model key means the saved demo only: the page replays fixtures, and nothing runs, resets or
// writes to Atlas. The public deploy runs this way so a visitor can't spend the key.
export const demoOnly = () => !process.env.OPENROUTER_API_KEY;

export const refuseInDemo = () =>
  demoOnly() ? Response.json({ error: "demo only: this deploy replays saved runs and has no model key" }, { status: 403 }) : null;
