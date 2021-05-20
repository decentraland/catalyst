import express from 'express'
import { LambdasService } from '../service/Service'

export class Controller {
  constructor(private service: LambdasService) {}

  async getStatus(req: express.Request, res: express.Response) {
    // Method: GET
    // Path: /status
    try {
      res.send(await this.service.getStatus())
    } catch (err) {
      res.status(500).send(`There was an error while processing your request: ${err.message}`)
    }
  }

  async getHealth(req: express.Request, res: express.Response) {
    // Method: GET
    // Path: /health
    try {
      res.send(await this.service.getHealth())
    } catch (err) {
      res.status(500).send(`There was an error while processing your request: ${err.message}`)
    }
  }
}
