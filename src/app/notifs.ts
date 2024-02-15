import { Request, Response } from "express";
import config from '../config.js'
import webPush, { supportedUrgency } from 'web-push'

const notifs = {
    publicKey: async (req: Request, res: Response) => {
        res.status(200).send(config.VAPID_PUBLIC_KEY)
    },
    register: async (req: Request, res: Response) => {
        console.log(req.body)
        res.status(200).send("SUCCESS")
    },
    sendNotification: async (req: Request, res: Response) => {
        webPush.sendNotification(req.body.subscription, "payload", {
            TTL: 0,
            urgency: "high",
            vapidDetails: {
                subject: "https://cameronmckay.xyz",
                publicKey: config.VAPID_PUBLIC_KEY!,
                privateKey: config.VAPID_PRIVATE_KEY!
            }
        })
        .then((val)=>{
            console.log(val)
            res.status(200).send("Success")
        })
        .catch((err)=>{
            console.log(err)
            res.status(500).send(err)
        })

    },
}

export default notifs;
