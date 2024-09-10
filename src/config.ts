import path from "path";
import dotenv from "dotenv";

// Parsing the env file.
dotenv.config({ path: path.resolve("./config.env") });

// Interface to load env variables
// Note these variables can possibly be undefined
// as someone could skip these variables or not setup a .env file at all

interface ENV {
    PORT: number,
    MONGO_URI: string,
    JWT_SECRET: string,
    JWT_EXPIRES_IN: string,
    ROOT_DIRECTORY: string,
    UPLOAD_DIRECTORY: string,
    DEV_EMAIL: string,
    EMAIL: string,
    EMAIL_PASS: string,
    DEBUG: boolean,
    WEBNX_TENANT_TOKEN: string,
    GSI_TENANT_TOKEN: string,
    ADMIN_TOKEN?: string,
    TECH_TOKEN?: string,
    KIOSK_TOKEN?: string,
    INVENTORY_TOKEN?: string,
    VAPID_PUBLIC_KEY?: string,
    VAPID_PRIVATE_KEY?: string,
}

// Loading process.env as ENV interface

const getConfig = (): ENV => {
  return {
    PORT: process.env.PORT ? parseInt(process.env.PORT) : 4001,
    MONGO_URI: process.env.MONGO_URI,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
    ROOT_DIRECTORY: process.env.ROOT_DIRECTORY,
    UPLOAD_DIRECTORY: process.env.UPLOAD_DIRECTORY,
    DEV_EMAIL: process.env.DEV_EMAIL,
    EMAIL: process.env.EMAIL,
    EMAIL_PASS: process.env.EMAIL_PASS,
    DEBUG: eval(process.env.DEBUG),
    WEBNX_TENANT_TOKEN: process.env.WEBNX_TENANT_TOKEN,
    GSI_TENANT_TOKEN: process.env.GSI_TENANT_TOKEN,
    ADMIN_TOKEN: process.env.ADMIN_TOKEN ? process.env.ADMIN_TOKEN : "",
    TECH_TOKEN: process.env.TECH_TOKEN ? process.env.TECH_TOKEN : "",
    KIOSK_TOKEN: process.env.KIOSK_TOKEN ? process.env.KIOSK_TOKEN : "",
    INVENTORY_TOKEN: process.env.INVENTORY_TOKEN ? process.env.INVENTORY_TOKEN : "",
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY ? process.env.VAPID_PUBLIC_KEY : "",
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY ? process.env.VAPID_PRIVATE_KEY : "",
  };
};

// Throwing an Error if any field was undefined we don't 
// want our app to run if it can't connect to DB and ensure 
// that these fields are accessible. If all is good return
// it as Config which just removes the undefined from our type 
// definition.

const getSanitizedConfig = (config: ENV): ENV => {
  for (const [key, value] of Object.entries(config)) {
    if (value === undefined) {
      throw new Error(`Missing key ${key} in config.env`);
    }
  }
  return config as ENV;
};

const config = getConfig();

const sanitizedConfig = getSanitizedConfig(config);

export default sanitizedConfig;
// Testing test