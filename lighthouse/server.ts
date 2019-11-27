import cors from "cors";
import express from "express";
import morgan from "morgan";

const port = process.env.PORT ?? 9000;

const rooms: Record<string, { id: string }[]> = {};

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan("combined"));

app.get("/hello", (req, res, next) => {
  res.send("Hello world!!!");
});

// GET /rooms[?userId=] -> returns list of rooms. Includes users per room by default. If a userId is specified, it returns the rooms which that user has joined.
app.get("/rooms", (req, res, next) => {
  const { userId } = req.query;
  const _rooms = userId
    ? Object.entries(rooms)
        .filter(([, users]) => users.some(user => user.id === userId))
        .map(([id]) => id)
    : Object.keys(rooms);
  res.send(_rooms);
});

// GET /room/:id -> returns list of users in a room with :id
app.get("/rooms/:roomId", (req, res, next) => {
  res.send(rooms[req.params.roomId]);
});

// PUT /room/:id { userid, nickname } -> adds a user to a particular room. If the room doesn’t exists, it creates it.
app.put("/rooms/:roomId", (req, res, next) => {
  const { roomId } = req.params;
  let room = rooms[roomId];
  if (!room) {
    rooms[roomId] = room = [];
  }
  if (!room.some($ => $.id === req.body.id)) {
    room.push(req.body);
  }
  res.send(room);
});

// DELETE /room/:id/:userId -> deletes a user from a room. If the room remains empty, it deletes the room.
app.delete("/rooms/:roomId/users/:userId", (req, res, next) => {
  const { roomId, userId } = req.params;
  let room = rooms[roomId];
  if (room) {
    const index = room.indexOf(room.find($ => $.id === userId) as any);
    if (index !== -1) {
      room.splice(index, 1);
    }
  }
  if (room.length === 0) {
    delete rooms[roomId];
  }
  res.end();
});

// [If needed] POST /offer/:userId { myUserId, nickname, room } -> Creates an offer of connection to a userId

app.listen(port, () => {
  console.info(`==> Lighthouse listening on port ${port}.`);
});
