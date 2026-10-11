import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../src/app';
import { initModels } from '../src/models';
import type { Realtime } from '../src/realtime';

export type RecordedEvent = { code: string; event: string; payload: any; hostOnly: boolean };

export const events: RecordedEvent[] = [];

/** Realtime stand-in that records what would have been broadcast over Socket.IO. */
export const recorder: Realtime = {
  emit(code, event, payload, hostOnly = false) {
    events.push({ code, event, payload, hostOnly });
  },
};

export const app = createApp(recorder);

let mongod: MongoMemoryServer | undefined;

export async function startDb(): Promise<void> {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await initModels(); // builds the unique indexes the tests rely on
}

export async function stopDb(): Promise<void> {
  await mongoose.disconnect();
  await mongod?.stop();
}

export async function resetDb(): Promise<void> {
  events.length = 0;
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
}

let counter = 0;

export async function registerHost(name = 'Test Host') {
  const email = `host${++counter}@example.com`;
  const res = await request(app).post('/api/auth/register').send({ name, email, password: 'password123' });
  return { token: res.body.token as string, email, res };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function createSession(hostToken: string, title = 'Team all-hands') {
  const res = await request(app).post('/api/sessions').set(bearer(hostToken)).send({ title });
  return res.body.session as { id: string; code: string; title: string; status: string };
}

export async function createPoll(
  hostToken: string,
  code: string,
  body: { question?: string; type?: 'single' | 'multiple'; options?: string[] } = {},
) {
  const res = await request(app)
    .post(`/api/sessions/${code}/polls`)
    .set(bearer(hostToken))
    .send({ question: 'Pick a framework', type: 'single', options: ['React', 'Vue', 'Svelte'], ...body });
  return res.body.poll as {
    id: string;
    options: { id: string; text: string }[];
    status: string;
    results: { totalVoters: number; counts: Record<string, number> };
  };
}

export async function setPollStatus(hostToken: string, pollId: string, status: 'open' | 'closed') {
  return request(app).patch(`/api/polls/${pollId}`).set(bearer(hostToken)).send({ status });
}

export async function join(code: string) {
  const res = await request(app).post(`/api/sessions/${code}/join`);
  return { token: res.body.token as string, voterId: res.body.voterId as string, res };
}

export const vote = (token: string, pollId: string, choices: string[]) =>
  request(app).post(`/api/polls/${pollId}/vote`).set(bearer(token)).send({ choices });
