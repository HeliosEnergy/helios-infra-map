import { toNodeHandler } from 'better-auth/node';
import { auth } from '../_lib/betterAuth.js';

export default toNodeHandler(auth.handler);
