import { NotificationSchema, NotificationTypes, UserSchema } from "../interfaces.js";
import Notification from "../../model/notification.js";
import User from "../../model/user.js";
import config from '../../config.js'
import handleError from "../../config/handleError.js";
import webPush, { PushSubscription } from 'web-push'

export async function sendNotificationToUser(
    user: string,
    type: NotificationTypes,
    text: string,
    link?: string,
) {
    let date = new Date()
    return Notification.create({
        user,
        type,
        text,
        link,
        date
    })
    .then((notif: NotificationSchema) => {
        return User.findById(user)
    })
    .then((user_object: UserSchema | null)=>{
        return Promise.all(
            (user_object&&user_object.subscriptions ? 
                user_object.subscriptions! : 
                [] as PushSubscription[]
            ).map((sub: PushSubscription)=>{
                return webPush.sendNotification(sub, JSON.stringify({
                    type,
                    text,
                    link,
                    date
                }), {
                    TTL: 0,
                    urgency: "high",
                    vapidDetails: {
                        subject: `mailto:${config.DEV_EMAIL}`,
                        publicKey: config.VAPID_PUBLIC_KEY!,
                        privateKey: config.VAPID_PRIVATE_KEY!
                    }
                })
                .catch(()=>{
                    return User.updateMany({}, {
                        $pull: {
                            subscriptions: {
                                endpoint: sub.endpoint
                            }
                        }
                    })
                })
            })
        )
    })
    .catch((err)=>{
        handleError(err)
        throw(err)
    })
}

export async function sendNotificationToGroup(
    role: string,
    type: NotificationTypes,
    text: string,
    link?: string,
) {
    let date = new Date()
    // Find all users with the role
    return User.find({roles: role})
    .then((users: UserSchema[]) => {
        // For every user
        return Promise.all(users.map((u)=>{
            // Create the notification
            return Notification.create({
                user: u._id,
                type,
                text,
                link,
                date
            })
            // Return user for next promise in chail
            .then((n)=>{
                return u
            })
        }))
    })
    .then((users: UserSchema[])=>{
        // For every user
        return Promise.all(users.map((user_object)=>{
            // For every subscription
            return Promise.all(
                (
                    user_object.subscriptions ? 
                    user_object.subscriptions! : 
                    [] as PushSubscription[]
                )
                .map((sub: PushSubscription)=>{
                    // Send the notification
                    return webPush.sendNotification(sub, JSON.stringify({
                        type,
                        text,
                        link,
                        date
                    }), {
                        TTL: 0,
                        urgency: "high",
                        vapidDetails: {
                            subject: `mailto:${config.DEV_EMAIL}`,
                            publicKey: config.VAPID_PUBLIC_KEY!,
                            privateKey: config.VAPID_PRIVATE_KEY!
                        }
                    })
                    .catch(()=>{
                        return User.updateMany({}, {
                            $pull: {
                                subscriptions: {
                                    endpoint: sub.endpoint
                                }
                            }
                        })
                    })
                })
            )
        }))
    })
    .catch((err)=>{
        handleError(err)
        throw(err)
    })
}

