import { Server } from "./Server";
import { Environment } from "./Environment";

Environment.getInstance().then(env => new Server(env).start())


/*

TODO: remove this

Some examples:

curl http://localhost:6969/entities/scenes?id=1&id=2

curl http://localhost:6969/entities/scenes?pointer=hola&pointer=chau&id=1&id=2&id=3&fields=contents,pointers
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


curl -F 'entityId=some-entity-id'  -F 'ethAddress=some-eth-address' -F 'signature=the-message-sginature' -F 'file1=@./package.json' -F 'file2=@./tsconfig.json' http://localhost:6969/entities
{
   "entityId":"some-entity-id",
   "ethAddress":"some-eth-address",
   "signature":"the-message-sginature",
   "files":[
      {
         "fieldname":"file1",
         "originalname":"package.json",
         "encoding":"7bit",
         "mimetype":"application/octet-stream",
         "destination":"uploads/",
         "filename":"fe06c2504631768b8150ac088c0675e8",
         "path":"uploads/fe06c2504631768b8150ac088c0675e8",
         "size":1691
      },
      {
         "fieldname":"file2",
         "originalname":"tsconfig.json",
         "encoding":"7bit",
         "mimetype":"application/octet-stream",
         "destination":"uploads/",
         "filename":"8c6356dc606b716ec518845e85c1d96f",
         "path":"uploads/8c6356dc606b716ec518845e85c1d96f",
         "size":904
      }
   ]
}

*/