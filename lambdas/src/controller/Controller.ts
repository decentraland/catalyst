import express from "express";
import { LambdasService } from "../service/Service";

export class Controller {
    constructor(private service: LambdasService) { }


    getStatus(req: express.Request, res: express.Response) {
        // Method: GET
        // Path: /status

        this.service.getStatus()
        .then(status => res.send(status))
    }

}


