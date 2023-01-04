import { Mongoose } from "mongoose"

export {}
declare global {
    namespace NodeJS {
        interface ProcessEnv {
            PORT: string,
            MONGO_URI: string,
            JWT_SECRET: string,
            JWT_EXPIRES_IN: string,
            ROOT_DIRECTORY: string,
            DEV_EMAIL: string,
            EMAIL: string,
            EMAIL_PASS: string,
            DEBUG: string,
            ADMIN_TOKEN?: string,
            TECH_TOKEN?: string,
            KIOSK_TOKEN?: string,
            INVENTORY_TOKEN?: string
        }
    }
}