import { NotificationTypes, PushTypes, UserSchema } from "../interfaces.js";
import Notification from "../model/notification.js";
import User from "../model/user.js";
import config from '../config.js'
import handleError from "../util/handleError.js";
import webPush, { PushSubscription } from 'web-push'
import nodemailer from 'nodemailer'
import { Options } from 'nodemailer/lib/mailer/index.js'

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
        // For every user
        return Promise.all(users.map((u)=>{
            // Create the notification
            return pushPayloadToUser(u._id, payload)
        }))
    })
    .catch((err)=>{
        handleError(err)
        throw(err)
    })
}

export async function sendEmailToGroup(role: string, subject: string, body: string) {
    let users = await User.find({roles: role})
    let emails = users.map((u)=>u.email!)
    let user = process.env.EMAIL 
    let pass = process.env.EMAIL_PASS
    let transporter = nodemailer.createTransport({
        service: 'Gmail',
        auth: {
            user,
            pass
        }
    });
    let mailOptions = {
        from: process.env.EMAIL,
        to: emails,
        subject,
        text: body 
    };
    transporter.sendMail(mailOptions as Options, function(err, info){
        if (err) {
            console.error(err)
        }
    }); 
    transporter.close()
}
