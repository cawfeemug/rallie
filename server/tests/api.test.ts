import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  app,
  bearer,
  createPoll,
  createSession,
  events,
  join,
  registerHost,
  resetDb,
  setPollStatus,
  startDb,
  stopDb,
  vote,
} from './helpers';

beforeAll(startDb);
afterAll(stopDb);
beforeEach(resetDb);

describe('auth', () => {
  it('registers, logs in and returns the profile', async () => {
    const { token, email, res } = await registerHost('Ada');
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Ada', email });
    expect(res.body.user.passwordHash).toBeUndefined();

    const login = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
    expect(login.status).toBe(200);

    const me = await request(app).get('/api/auth/me').set(bearer(token));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
  });

  it('rejects duplicate emails, weak passwords and wrong credentials', async () => {
    const { email } = await registerHost();
    const dup = await request(app).post('/api/auth/register').send({ name: 'X', email, password: 'password123' });
    expect(dup.status).toBe(409);

    const weak = await request(app).post('/api/auth/register').send({ name: 'X', email: 'new@example.com', password: 'short' });
    expect(weak.status).toBe(400);

    const wrong = await request(app).post('/api/auth/login').send({ email, password: 'not-the-password' });
    expect(wrong.status).toBe(401);

    const anon = await request(app).get('/api/auth/me');
    expect(anon.status).toBe(401);
  });
});

describe('sessions', () => {
  it('requires a host login to create a session', async () => {
    const res = await request(app).post('/api/sessions').send({ title: 'Nope' });
    expect(res.status).toBe(401);
  });

  it('creates a session with a 6 character join code and lists it for its host only', async () => {
    const a = await registerHost();
    const b = await registerHost();
    const session = await createSession(a.token);
    expect(session.code).toMatch(/^[A-Z0-9]{6}$/);

    const mine = await request(app).get('/api/sessions').set(bearer(a.token));
    expect(mine.body.sessions).toHaveLength(1);
    const theirs = await request(app).get('/api/sessions').set(bearer(b.token));
    expect(theirs.body.sessions).toHaveLength(0);
  });

  it('hides draft polls from the public but not from the host', async () => {
    const host = await registerHost();
    const { code } = await createSession(host.token);
    await createPoll(host.token, code);

    const publicView = await request(app).get(`/api/sessions/${code}`);
    expect(publicView.status).toBe(200);
    expect(publicView.body.polls).toHaveLength(0);
    expect(publicView.body.isHost).toBe(false);

    const hostView = await request(app).get(`/api/sessions/${code}`).set(bearer(host.token));
    expect(hostView.body.polls).toHaveLength(1);
    expect(hostView.body.isHost).toBe(true);
  });

  it('stops another host from changing a session', async () => {
    const owner = await registerHost();
    const intruder = await registerHost();
    const { code } = await createSession(owner.token);

    const res = await request(app).patch(`/api/sessions/${code}`).set(bearer(intruder.token)).send({ status: 'ended' });
    expect(res.status).toBe(403);
    const poll = await request(app)
      .post(`/api/sessions/${code}/polls`)
      .set(bearer(intruder.token))
      .send({ question: 'Hijack?', options: ['a', 'b'] });
    expect(poll.status).toBe(403);
  });

  it('returns 404 for unknown or malformed codes', async () => {
    expect((await request(app).get('/api/sessions/ZZZZZZ')).status).toBe(404);
    expect((await request(app).get('/api/sessions/not-a-code')).status).toBe(404);
  });
});

describe('polls', () => {
  it('validates options', async () => {
    const host = await registerHost();
    const { code } = await createSession(host.token);
    const post = (body: object) => request(app).post(`/api/sessions/${code}/polls`).set(bearer(host.token)).send(body);

    expect((await post({ question: 'Only one option?', options: ['a'] })).status).toBe(400);
    expect((await post({ question: 'Dupes?', options: ['Same', 'same'] })).status).toBe(400);
    expect((await post({ question: 'ok?', options: ['a', 'b'] })).status).toBe(201);
  });

  it('keeps only one poll open at a time', async () => {
    const host = await registerHost();
    const { code } = await createSession(host.token);
    const first = await createPoll(host.token, code, { question: 'First poll' });
    const second = await createPoll(host.token, code, { question: 'Second poll' });

    await setPollStatus(host.token, first.id, 'open');
    await setPollStatus(host.token, second.id, 'open');

    const view = await request(app).get(`/api/sessions/${code}`).set(bearer(host.token));
    const status = Object.fromEntries(view.body.polls.map((p: any) => [p.id, p.status]));
    expect(status[first.id]).toBe('closed');
    expect(status[second.id]).toBe('open');
  });

  it('does not let participants manage polls', async () => {
    const host = await registerHost();
    const { code } = await createSession(host.token);
    const poll = await createPoll(host.token, code);
    const { token } = await join(code);

    const open = await request(app).patch(`/api/polls/${poll.id}`).set(bearer(token)).send({ status: 'open' });
    expect(open.status).toBe(401);
  });

  it('broadcasts drafts to the host room only, and opening to everyone', async () => {
    const host = await registerHost();
    const { code } = await createSession(host.token);
    const poll = await createPoll(host.token, code);

    const created = events.find((e) => e.event === 'poll:created');
    expect(created?.hostOnly).toBe(true);

    await setPollStatus(host.token, poll.id, 'open');
    const updated = events.find((e) => e.event === 'poll:updated');
    expect(updated?.hostOnly).toBe(false);
    expect(updated?.payload.status).toBe('open');
  });
});

describe('voting', () => {
  async function openPoll(type: 'single' | 'multiple' = 'single') {
    const host = await registerHost();
    const { code } = await createSession(host.token);
    const poll = await createPoll(host.token, code, { type });
    await setPollStatus(host.token, poll.id, 'open');
    return { host, code, poll };
  }

  it('counts a vote and returns updated results', async () => {
    const { code, poll } = await openPoll();
    const { token } = await join(code);

    const res = await vote(token, poll.id, ['o1']);
    expect(res.status).toBe(201);
    expect(res.body.results.totalVoters).toBe(1);
    expect(res.body.results.counts).toEqual({ o0: 0, o1: 1, o2: 0 });
  });

  it('refuses a second vote from the same participant', async () => {
    const { code, poll } = await openPoll();
    const { token } = await join(code);

    expect((await vote(token, poll.id, ['o0'])).status).toBe(201);
    const again = await vote(token, poll.id, ['o2']);
    expect(again.status).toBe(409);

    const view = await request(app).get(`/api/sessions/${code}`).set(bearer(token));
    expect(view.body.myVotes[poll.id]).toEqual(['o0']);
    expect(view.body.polls[0].results.totalVoters).toBe(1);
  });

  it('lets only one of many simultaneous votes from the same participant through', async () => {
    const { code, poll } = await openPoll();
    const { token } = await join(code);

    const responses = await Promise.all(Array.from({ length: 10 }, () => vote(token, poll.id, ['o0'])));
    const statuses = responses.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(9);

    const view = await request(app).get(`/api/sessions/${code}`);
    expect(view.body.polls[0].results.counts.o0).toBe(1);
  });

  it('tallies many different participants correctly', async () => {
    const { code, poll } = await openPoll();
    const picks = ['o0', 'o0', 'o0', 'o1', 'o1', 'o2'];
    for (const pick of picks) {
      const { token } = await join(code);
      expect((await vote(token, poll.id, [pick])).status).toBe(201);
    }
    const view = await request(app).get(`/api/sessions/${code}`);
    expect(view.body.polls[0].results).toMatchObject({ totalVoters: 6, counts: { o0: 3, o1: 2, o2: 1 } });
  });

  it('validates choices against the poll type', async () => {
    const single = await openPoll('single');
    const p1 = await join(single.code);
    expect((await vote(p1.token, single.poll.id, ['nope'])).status).toBe(400);
    expect((await vote(p1.token, single.poll.id, ['o0', 'o1'])).status).toBe(400);

    const multi = await openPoll('multiple');
    const p2 = await join(multi.code);
    const res = await vote(p2.token, multi.poll.id, ['o0', 'o2', 'o2']); // duplicates are collapsed
    expect(res.status).toBe(201);
    expect(res.body.results).toMatchObject({ totalVoters: 1, counts: { o0: 1, o1: 0, o2: 1 } });
  });

  it('rejects votes on closed polls, ended sessions and foreign tokens', async () => {
    const { host, code, poll } = await openPoll();
    const { token } = await join(code);

    const other = await registerHost();
    const otherSession = await createSession(other.token, 'Another room');
    const foreign = await join(otherSession.code);
    expect((await vote(foreign.token, poll.id, ['o0'])).status).toBe(403);

    await setPollStatus(host.token, poll.id, 'closed');
    expect((await vote(token, poll.id, ['o0'])).status).toBe(409);

    await setPollStatus(host.token, poll.id, 'open');
    await request(app).patch(`/api/sessions/${code}`).set(bearer(host.token)).send({ status: 'ended' });
    expect((await vote(token, poll.id, ['o0'])).status).toBe(409);
  });

  it('requires a participant token and broadcasts new results', async () => {
    const { code, poll } = await openPoll();
    const anon = await request(app).post(`/api/polls/${poll.id}/vote`).send({ choices: ['o0'] });
    expect(anon.status).toBe(401);

    const { token } = await join(code);
    await vote(token, poll.id, ['o0']);
    await new Promise((r) => setTimeout(r, 50)); // results broadcast is throttled and async
    const results = events.find((e) => e.event === 'poll:results');
    expect(results?.payload).toMatchObject({ pollId: poll.id, totalVoters: 1 });
  });

  it('resets votes so people can vote again', async () => {
    const { host, code, poll } = await openPoll();
    const { token } = await join(code);
    await vote(token, poll.id, ['o0']);

    const reset = await request(app).post(`/api/polls/${poll.id}/reset`).set(bearer(host.token));
    expect(reset.status).toBe(200);
    expect(reset.body.results.totalVoters).toBe(0);
    expect((await vote(token, poll.id, ['o1'])).status).toBe(201);
  });
});

describe('questions', () => {
  async function setup() {
    const host = await registerHost();
    const { code } = await createSession(host.token);
    const participant = await join(code);
    return { host, code, participant };
  }

  const ask = (code: string, token: string, text: string, name?: string) =>
    request(app).post(`/api/sessions/${code}/questions`).set(bearer(token)).send({ text, name });

  it('lets a participant ask, and everyone read, without leaking identities', async () => {
    const { code, participant } = await setup();
    const res = await ask(code, participant.token, 'How does this scale?', 'Sam');
    expect(res.status).toBe(201);
    expect(res.body.question).toMatchObject({ text: 'How does this scale?', authorName: 'Sam', upvotes: 0 });

    const view = await request(app).get(`/api/sessions/${code}`);
    expect(view.body.questions).toHaveLength(1);
    expect(JSON.stringify(view.body)).not.toContain(participant.voterId);
    expect(view.body.questions[0].upvoters).toBeUndefined();
    expect(view.body.questions[0].authorId).toBeUndefined();
  });

  it('toggles upvotes atomically and never goes negative', async () => {
    const { code, participant } = await setup();
    const q = (await ask(code, participant.token, 'Upvote me please')).body.question;
    const other = await join(code);
    const up = (token: string) => request(app).post(`/api/questions/${q.id}/upvote`).set(bearer(token));

    expect((await up(participant.token)).body).toMatchObject({ upvoted: true, question: { upvotes: 1 } });
    expect((await up(other.token)).body.question.upvotes).toBe(2);
    expect((await up(participant.token)).body).toMatchObject({ upvoted: false, question: { upvotes: 1 } });

    // Hammering the same toggle in parallel must keep the counter consistent (0 or 1 from this voter).
    await Promise.all(Array.from({ length: 8 }, () => up(other.token)));
    const view = await request(app).get(`/api/sessions/${code}`).set(bearer(other.token));
    const final = view.body.questions[0];
    expect(final.upvotes).toBeGreaterThanOrEqual(0);
    expect(final.upvotes).toBe(final.upvoted ? 1 : 0);
  });

  it('lets only the host moderate', async () => {
    const { host, code, participant } = await setup();
    const q = (await ask(code, participant.token, 'Is this answered yet?')).body.question;

    const byParticipant = await request(app)
      .patch(`/api/questions/${q.id}`)
      .set(bearer(participant.token))
      .send({ answered: true });
    expect(byParticipant.status).toBe(401);

    const byHost = await request(app).patch(`/api/questions/${q.id}`).set(bearer(host.token)).send({ answered: true });
    expect(byHost.status).toBe(200);
    expect(byHost.body.question.answered).toBe(true);

    expect((await request(app).delete(`/api/questions/${q.id}`).set(bearer(host.token))).status).toBe(204);
    const view = await request(app).get(`/api/sessions/${code}`);
    expect(view.body.questions).toHaveLength(0);
  });

  it('validates length and caps questions per participant', async () => {
    const { code, participant } = await setup();
    expect((await ask(code, participant.token, 'hi')).status).toBe(400);
    for (let i = 0; i < 10; i++) {
      expect((await ask(code, participant.token, `Question number ${i}`)).status).toBe(201);
    }
    expect((await ask(code, participant.token, 'One question too many')).status).toBe(429);
  });
});

describe('deleting a session', () => {
  it('removes its polls, votes and questions', async () => {
    const host = await registerHost();
    const { code } = await createSession(host.token);
    const poll = await createPoll(host.token, code);
    await setPollStatus(host.token, poll.id, 'open');
    const { token } = await join(code);
    await vote(token, poll.id, ['o0']);

    expect((await request(app).delete(`/api/sessions/${code}`).set(bearer(host.token))).status).toBe(204);
    expect((await request(app).get(`/api/sessions/${code}`)).status).toBe(404);
    expect((await vote(token, poll.id, ['o0'])).status).toBe(404);
  });
});
