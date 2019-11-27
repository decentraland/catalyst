import cors from "cors";
import express from "express";

const port = process.env.PORT ?? 9000;

const app = express();
app.use(cors());

app.get("/hello", (req, res, next) => {
  res.send("Hello world!!!");
});

app.listen(port, () => {
  console.info(`==> Lighthouse listening on port ${port}.`);
});
