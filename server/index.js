/* Local dev server. On Vercel, api/index.js is used instead. */
const app = require("./app");
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Namaste Bharat Inn running → http://localhost:${PORT}`);
});
