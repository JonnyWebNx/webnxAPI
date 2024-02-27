import { NotificationSchema, NotificationTypes, PushTypes, UserSchema } from "../../interfaces.js";
import Notification from "../../model/notification.js";
import User from "../../model/user.js";
import config from '../../config.js'
import handleError from "../../util/handleError.js";
import webPush, { PushSubscription } from 'web-push'

async function createNotification(
    date: Date,
    user: string,
    type: NotificationTypes,
    text: string,
    title?: string,
    link?: string
) {
    return Notification.create({
        user,
        type,
        text,
        link,
        date,
        title
    })
    .then(() => {
        return User.findById(user)
    })
    .then((user_object: UserSchema | null)=>{
        return Promise.all(
            (user_object&&user_object.subscriptions ? 
                user_object.subscriptions! : 
                [] as PushSubscription[]
            ).map(async (sub: PushSubscription)=>{
                return webPush.sendNotification(sub, JSON.stringify({
                    type: PushTypes.Notification,
                    payload: {
                        type,
                        text,
                        link,
                        date,
                        title
                    }
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

export async function sendNotificationToUser(
    user: string,
    type: NotificationTypes,
    text: string,
    link?: string,
    title?: string
) {
    let date = new Date()
    createNotification(date, user, type, text, title, link)
}

export async function sendNotificationToGroup(
    role: string,
    type: NotificationTypes,
    text: string,
    link?: string,
    title?: string,
) {
    let date = new Date()
    // Find all users with the role
    return User.find({roles: role})
    .then((users: UserSchema[]) => {
        // For every user
        return Promise.all(users.map((u)=>{
            // Create the notification
            return createNotification(date, u._id, type, text, title, link)
        }))
    })
    .catch((err)=>{
        handleError(err)
        throw(err)
    })
}

export async function pushPayloadToUser(
    user: string,
    payload: any
) {
    User.findById(user)
    .then((user_object: UserSchema | null)=>{
        return Promise.all(
            (user_object&&user_object.subscriptions ? 
                user_object.subscriptions! : 
                [] as PushSubscription[]
            ).map(async (sub: PushSubscription)=>{
                console.log("Payload sent to: "+user_object?.first_name+" "+user_object?.last_name)
                return webPush.sendNotification(sub, JSON.stringify({
                    type: PushTypes.Payload,
                    payload
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

export async function pushPayloadToRole(
    role: string,
    payload: any
) {
    return User.find({roles: role})
    .then((users: UserSchema[]) => {
        console.log("Get all users")
        // For every user
        return Promise.all(users.map((u)=>{
            console.log("User: "+u.first_name+" "+u.last_name)
            // Create the notification
            return pushPayloadToUser(u._id, payload)
        }))
    })
    .catch((err)=>{
        handleError(err)
        throw(err)
    })
}
