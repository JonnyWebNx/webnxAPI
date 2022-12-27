import { ReqUser } from "../../src/app/interfaces.js";

export {}

declare global {
  namespace Express {
    interface Request {
      user: ReqUser;
    }
  }
}

