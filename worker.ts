import { Hono } from 'hono';
import api from './src/api';

const app = new Hono();

// Mount the API
app.route('/api', api);

export default app;
