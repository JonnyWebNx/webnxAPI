import { Request, Response } from "express";
import config from '../config.js'
import webPush from 'web-push'
import handleError from "../config/handleError.js";

const notifs = {
    publicKey: async (req: Request, res: Response) => {
        try {
            res.status(200).send(config.VAPID_PUBLIC_KEY)
        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },
    register: async (req: Request, res: Response) => {
        try {
            console.log(req.body)
            res.status(200).send("SUCCESS")
        } catch (err) {
            throw(err)
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },
    sendNotification: async (req: Request, res: Response) => {
        webPush.sendNotification(req.body.subscription, "payload", {
            TTL: 0,
            urgency: "high",
            vapidDetails: {
                subject: `mailto:${config.DEV_EMAIL}`,
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
