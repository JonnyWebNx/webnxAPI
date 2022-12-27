import path from "path";
import dotenv from "dotenv";

// Parsing the env file.
dotenv.config({ path: path.resolve("./config.env") });

// Interface to load env variables
// Note these variables can possibly be undefined
// as someone could skip these varibales or not setup a .env file at all

interface ENV {
    PORT: number | undefined,
    MONGO_URI: string,
    JWT_SECRET: string,
    JWT_EXPIRES_IN: string,
    ROOT_DIRECTORY: string,
    EMAIL: string,
    EMAIL_PASS: string,
    DEBUG: boolean
}

interface Config {
  PORT: number | undefined,
  MONGO_URI: string,
  JWT_SECRET: string,
  JWT_EXPIRES_IN: string,
  ROOT_DIRECTORY: string,
  EMAIL: string,
  EMAIL_PASS: string,
  DEBUG: boolean
}

// Loading process.env as ENV interface

const getConfig = (): ENV => {
  return {
    PORT: process.env.PORT ? parseInt(process.env.PORT) : undefined,
    MONGO_URI: process.env.MONGO_URI,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
    ROOT_DIRECTORY: process.env.ROOT_DIRECTORY,
    EMAIL: process.env.EMAIL,
    EMAIL_PASS: process.env.EMAIL_PASS,
    DEBUG: eval(process.env.DEBUG)
  };
};

// Throwing an Error if any field was undefined we don't 
// want our app to run if it can't connect to DB and ensure 
// that these fields are accessible. If all is good return
// it as Config which just removes the undefined from our type 
// definition.

const getSanitzedConfig = (config: ENV): Config => {
  for (const [key, value] of Object.entries(config)) {
    if (value === undefined) {
      throw new Error(`Missing key ${key} in config.env`);
    }
  }
  return config as Config;
};

const config = getConfig();

const sanitizedConfig = getSanitzedConfig(config);

export default sanitizedConfig;
