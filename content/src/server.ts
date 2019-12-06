import cors from "cors";
import express from "express";
import morgan from "morgan";
import multer from "multer";

const port = process.env.PORT ?? 6969;

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan("combined"));

var upload = multer({ dest: 'uploads/' })

// TODO: Create a version endpoint 
// TODO: Move the handler functions to the controller directory

const getEntities = (req: express.Request, res: express.Response) => {
  // Method: GET
  // Path: /entities/:type
  // Query String: ?{filter}&fields={fieldList}
  const type     = req.params.type
  const pointers = req.query.pointer
  const ids      = req.query.id
  const fields   = req.query.fields

  res.send({
    type: type,
    pointers: pointers,
    ids: ids,
    fields: fields,
  })
}
const createEntity = (req: express.Request, res: express.Response) => {
  // Method: POST
  // Path: /entities
  // Body: JSON with entityId,ethAddress,signature; and a set of files
  const entityId   = req.body.entityId;
  const ethAddress = req.body.ethAddress;
  const signature  = req.body.signature;
  const files      = req.files

  res.send({
    entityId: entityId,
    ethAddress: ethAddress,
    signature: signature,
    files: files,
  })
}
const getContent = (req: express.Request, res: express.Response) => {
  // Method: GET
  // Path: /contents/:hashId
  const hashId = req.params.hashId;

  res.send({
    hashId: hashId,
  })
}
const getAvailableContent = (req: express.Request, res: express.Response) => {
  // Method: GET
  // Path: /available-content
  // Query String: ?cid={hashId1}&cid={hashId2}
  const cids = req.query.cid
  
  res.send({
    cids: cids,
  })
}
const getPointers = (req: express.Request, res: express.Response) => {
  // Method: GET
  // Path: /pointers/:type
  const type = req.params.type;
  
  res.send({
    type: type,
  })
}
const getAudit = (req: express.Request, res: express.Response) => {
  // Method: GET
  // Path: /audit/:type/:entityId
  const type     = req.params.type;
  const entityId = req.params.entityId;
  
  res.send({
    type: type,
    entityId: entityId,
  })
}
const getHistory = (req: express.Request, res: express.Response) => {
  // Method: GET
  // Path: /history
  // Query String: ?from={timestamp}&to={timestamp}&type={type}
  const from = req.query.from
  const to   = req.query.to
  const type = req.query.type
  
  res.send({
    from: from,
    to: to,
    type: type,
  })
}

app.get("/entities/:type"       , getEntities);
app.post("/entities"            , upload.any(), createEntity);
app.get("/contents/:hashId"     , getContent);
app.get("/available-content"    , getAvailableContent);
app.get("/pointers/:type"       , getPointers);
app.get("/audit/:type/:entityId", getAudit);
app.get("/history"              , getHistory);


app.listen(port, () => {
  console.info(`==> Content Server listening on port ${port}.`);
});


/*

TODO: remove this

Some examples:

http://localhost:6969/entities/scenes?pointer=hola&pointer=chau&id=1&id=2&id=3&fields=contents,pointers
{
	"type": "scenes",
	"pointers": [
		"hola",
		"chau"
	],
	"ids": [
		"1",
		"2",
		"3"
	],
	"fields": "contents,pointers"
}


curl -F 'entityId=some-entity-id'  -F 'ethAddress=some-eth-address' -F 'signature=the-message-sginature' -F 'fileX=@./test.xml' -F 'fileY=@./test.log' http://localhost:6969/entities
{
	"entityId": "some-entity-id",
	"ethAddress": "some-eth-address",
	"signature": "the-message-sginature",
	"files": [{
		"fieldname": "fileX",
		"originalname": "test.xml",
		"encoding": "7bit",
		"mimetype": "application/xml",
		"destination": "uploads/",
		"filename": "51526e2bd674d4502de25cac1fcf4590",
		"path": "uploads/51526e2bd674d4502de25cac1fcf4590",
		"size": 914
	}, {
		"fieldname": "fileY",
		"originalname": "test.log",
		"encoding": "7bit",
		"mimetype": "application/octet-stream",
		"destination": "uploads/",
		"filename": "b18194be37dafe4dcb6255a0c1b55142",
		"path": "uploads/b18194be37dafe4dcb6255a0c1b55142",
		"size": 539
	}]
}

*/