import { ReqUser } from "../../src/interfaces.js";

export {}

declare global {
  namespace Express {
    interface Request {
      user: ReqUser;
    }
  }
}

