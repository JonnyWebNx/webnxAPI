import { Request, Response } from "express";
import config from '../config.js'
import webPush, { PushSubscription } from 'web-push'
import handleError from "../config/handleError.js";
import User from "../model/user.js";

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
            let subscription = req.body.subscription as PushSubscription
            // Validate subscription
            if (
                !subscription
                || !subscription.endpoint
            ) {
                res.status(400).send('You must pass in a subscription with at least an endpoint.');
            }
            // Validate endpoint
            if (
                typeof subscription.endpoint !== 'string'
                || subscription.endpoint.length === 0
            ) {
              res.status(400).send('The subscription endpoint must be a string with a valid URL.');
            }
            // Validate the subscription keys
            if (
                typeof subscription !== 'object'
                || !subscription.keys
                || !subscription.keys.p256dh
                || !subscription.keys.auth
            ) {
                res.status(400).send('To send a message with a payload, the subscription must have \'auth\' and \'p256dh\' keys.');
            }
            // Remove any exisiting subscriptions
            User.updateMany({}, {
                $pull: {
                    subscriptions: {
                        endpoint: subscription.endpoint
                    }
                }
            })
            .then(()=>{
                // Add subscription to current user
                return User.findByIdAndUpdate(req.user.user_id, {
                    $push: {
                        subscriptions: subscription
                    }
                })
            })
            .then(()=>{
                res.status(200).send("SUCCESS")
            })
            .catch((err)=>{
                res.status(500).send("API could not handle your request: " + err);
            })
        } catch (err) {
            handleError(err)
            return res.status(500).send("API could not handle your request: " + err);
        }
    },
    sendNotification: async (req: Request, res: Response) => {
        console.log(req.body.subscription)
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
