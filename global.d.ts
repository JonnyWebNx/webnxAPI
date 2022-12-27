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
            EMAIL: string,
            EMAIL_PASS: string,
            DEBUG: string
        }
    }
}