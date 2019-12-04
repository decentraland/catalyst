import cors from "cors";
import express from "express";
import morgan from "morgan";

const port = process.env.PORT ?? 6969;

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan("combined"));

app.get("/hello", (req, res, next) => {
  res.send("Hello world!!!");
});

app.listen(port, () => {
  console.info(`==> Content Server listening on port ${port}.`);
});
