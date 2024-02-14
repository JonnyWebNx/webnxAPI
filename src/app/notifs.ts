import { Request, Response } from "express";
import config from '../config.js'

const notifs = {
    publicKey: async (req: Request, res: Response) => {
        res.status(200).send(config.VAPID_PUBLIC_KEY)
    },
    register: async (req: Request, res: Response) => {
        console.log(req.body)
        res.status(200).send("SUCCESS")
    },
    sendNotification: async (req: Request, res: Response) => {
    },
}

export default notifs;
