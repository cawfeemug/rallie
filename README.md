# Rallie: A Real-Time Polling and Q&A Web Application

## 1. Overview

Rallie is a web application for running live polls and audience questions during a lecture, meeting or event. A host creates a session and displays a QR code. Participants scan it with their phones and join without installing an app or creating an account. When participants vote, the results update immediately on every connected screen, including a full-screen projector view for the room.

The project demonstrates how a modern full-stack web application is designed, built and deployed. It combines a responsive front end, a back-end server, a database and real-time communication, and it is packaged so that the whole system starts with a single command.

## 2. Objectives

1. Build a working web application that covers the front end, back end, database and deployment.
2. Support real-time interaction, so that results appear without refreshing the page.
3. Make the system usable by a large audience on mobile devices, with no sign-up step.
4. Protect the integrity of the data, in particular by preventing a participant from voting twice on the same poll.
5. Package the system in containers so that it runs the same way on any computer.

## 3. Features

- **Live polls:** single-choice and multiple-choice polls, with one poll open at a time. Results update as votes arrive.
- **Audience Q&A:** participants submit questions anonymously or with a name and upvote each other's questions. The host marks questions as answered or removes them.
- **Three views:** a host dashboard for managing the session, a mobile-friendly participant view, and a projector view for display.
- **Joining:** by scanning a QR code or typing a six-character code.
- **Accounts for hosts only:** hosts register and sign in. Participants do not need an account.
- **Light and dark themes** and layouts that adapt to phone, tablet and desktop screens.

## 4. Technology Stack and Rationale

| Area | Technologies |
|---|---|
| Front end | HTML, CSS, TypeScript, React, Vite, React Router |
| Back end | Node.js, Express |
| Database | MongoDB, with the Mongoose library |
| Real-time communication | Socket.IO (WebSockets) |
| Security and validation | JSON Web Tokens, bcrypt, Zod, Helmet, rate limiting |
| Deployment | Docker, Docker Compose, nginx |
| Testing and automation | Vitest, Supertest, GitHub Actions |

### 4.1 HTML, CSS and TypeScript

HTML provides the page structure and CSS controls the visual design, including the colour themes and the responsive layouts for different screen sizes. TypeScript was used instead of plain JavaScript for all application code. It adds type checking, so mistakes such as passing the wrong kind of data to a function are caught while the code is written, not when the program is running. This was particularly useful here because the front end and back end exchange many data structures, such as polls, votes and questions.

### 4.2 React

React is a library for building user interfaces from reusable components. It was chosen because the application contains many parts that change frequently, such as result bars, question lists and connection status, and React updates only the parts of the page that change. Components such as the result bars and the question list are written once and reused on the host, participant and projector views. Vite was used as the build tool and React Router handles navigation between the views.

### 4.3 Node.js and Express

Node.js allows the server to be written in the same language as the front end, which simplifies development and allows type definitions to be shared. Express provides the structure for the server's web interface (API). The server receives requests from the browser, such as creating a poll or submitting a vote, checks them, reads or writes the database, and returns a response.

### 4.4 MongoDB

MongoDB is a document database that stores data as flexible, JSON-like records. It suits this application because a poll naturally contains a list of options, and a session naturally groups polls and questions. The database stores users, sessions, polls, votes and questions. It also enforces an important rule directly: each participant can have only one vote per poll. Because the database itself rejects a second vote, the rule holds even if two requests arrive at the same moment.

### 4.5 Socket.IO and WebSockets

An ordinary web request is a one-time exchange in which the browser asks and the server answers. This is not suitable for live results, because the server would have to wait to be asked. WebSockets keep a connection open so that the server can send updates whenever something changes. Socket.IO builds on this and handles reconnection automatically. When a vote is saved, the server sends the new totals to every screen in that session, so the host, the projector and all phones update within a fraction of a second.

### 4.6 Security and Validation

- **Passwords** are stored as one-way hashes using bcrypt, so the original password is never saved.
- **JSON Web Tokens (JWT)** prove who a user is after sign-in. Participants receive an anonymous token that is valid only for the session they joined, which allows the system to recognise a returning browser without requiring an account.
- **Zod** checks the format of every incoming request before it is processed, rejecting invalid or unexpected data.
- **Helmet** adds standard protective settings to the server's responses.
- **Rate limiting** restricts how many requests a client can make in a given time to reduce spam and password guessing. Voting limits are applied per participant, not per network address, because a whole room often shares one Wi-Fi connection.

### 4.7 Docker, Docker Compose and nginx

Docker packages an application together with everything it needs to run, so it behaves the same on any computer. Docker Compose starts several containers together. Here, it runs three: the database, the Node.js server, and an nginx web server. nginx serves the built front end and forwards requests to the server. As a result, the browser communicates with a single address, which removes the need for cross-origin configuration. This allows the lecturer to run the entire system with one command and without installing Node.js or MongoDB.

### 4.8 Testing and Continuous Integration

The back end has an automated test suite using Vitest and Supertest, which run against a temporary in-memory database. The tests cover registration and sign-in, session and poll management, voting rules, and questions and upvotes, including a test that sends many votes from the same participant at once to confirm that only one is counted. GitHub Actions runs the tests, the TypeScript checks, the front-end build and the Docker build automatically whenever new code is pushed.

## 5. System Architecture

The system has three parts, each running in its own container:

1. **Web server (nginx).** Delivers the React application to the browser and forwards API and real-time traffic to the application server.
2. **Application server (Node.js and Express with Socket.IO).** Contains the application logic: authentication, validation, poll and question handling, and live updates.
3. **Database (MongoDB).** Stores all persistent data.

### How a vote is processed

1. A participant selects an option on their phone and submits.
2. The browser sends the vote to the server.
3. The server checks that the token is valid, the session is live and the poll is open.
4. The server saves the vote. The database rejects it if the participant has already voted on that poll.
5. The server counts the votes for the poll.
6. The server sends the updated totals to every connected screen over WebSockets.
7. The host dashboard, the projector view and the participants' phones redraw their results.

When many people vote at the same time, the server groups the updates into short intervals so that it does not recalculate and broadcast the totals for every single vote.

### Recovery from connection loss

The front end loads the full state of a session when it opens and then applies live updates as small changes. If the connection drops and reconnects, for example when a phone briefly loses signal, the page reloads the full state so that it cannot remain out of date.

## 6. Results

- The application runs end to end in Docker and was verified manually on desktop and on a mobile phone using a public tunnel. Votes and questions submitted from the phone appeared on the host and projector views without refreshing.
- The one-vote-per-participant rule holds under simultaneous requests, as shown by the automated concurrency test.
- Participants join with no installation and no account, which meets the usability objective.
- A seeded demo session allows the system to be evaluated immediately, without creating data first.
- A start-up ordering problem was found during testing: after a restart, nginx could start before the application server was ready and fail. It was resolved by configuring nginx to look up the server when a request arrives.

## 7. Limitations and Future Work

- **Participant identity is per browser.** A participant who clears their browser data and rejoins is treated as a new person and could vote again. A stricter system would need accounts or a join PIN, which would add effort for the audience.
- **Votes are final.** Changing a vote after submitting is not supported.
- **Single server instance.** The real-time features run in one process. Running several instances would require a shared message layer such as Redis.
- **Possible extensions:** additional poll types (word clouds, ratings), exporting results to a file, and a fixed public address instead of a temporary tunnel link.

## 8. Use of AI Tools

This project was developed with the assistance of an AI tool (Claude by Anthropic), which was used to generate much of the source code and to explain the technologies. The author defined the project and its requirements, selected the technology stack, ran and tested the system, diagnosed the problems that arose during setup and deployment (a port conflict and the container start-up order), and prepared this documentation.

## 9. How to Run the Project

### Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/), installed and running. No other software is needed.

### Steps

1. Download or clone the project and open a terminal in the project folder (the one containing `docker-compose.yml`).
2. Start the system:
```bash
   docker compose up --build
```
   The first build takes a few minutes. Wait until the log stops showing new output.
3. Open **http://localhost:8080** in a web browser.
4. Click **Host a session**, then **Sign in as demo host**. The demo account is:
   - Email: `demo@rallie.dev`
   - Password: `demo1234`
5. Stop the system with `Ctrl+C`, or run `docker compose down` from another terminal.

If port 8080 is already in use, copy `.env.example` to `.env`, change the `PORT` value (for example to 8081), and run step 2 again using that port in the address.

### Trying the application

1. Sign in as the demo host and open the session **Pulse Live Demo** (join code `DEMO42`). This is a pre-built demo session.
2. Click **Open projector view**. This opens the big-screen view in a new tab.
3. In a third browser window, open **http://localhost:8080/s/DEMO42**. This is what a participant sees.
4. On the host page, click **Start voting** on a poll. It appears in the participant window.
5. Vote in the participant window. The results on the projector view and host page update immediately.
6. Submit a question from the participant window and upvote it. It appears in the host's question list, where it can be marked as answered.

To test with a real phone, the phone must be able to reach the computer. On the same Wi-Fi network, open `http://<computer-ip>:8080` and enter that address in the **Use this address** box on the host page so that the QR code points to it. Alternatively, a free Cloudflare quick tunnel gives a temporary public link:

```bash
docker run --rm cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://host.docker.internal:8080
```

Paste the `https://...trycloudflare.com` link that it prints into the **Use this address** box.

### Running the automated tests (optional)

Node.js 20 or newer is required.

```bash
cd server
npm install
npm test
```

The tests download a temporary MongoDB binary the first time they run, so an internet connection is needed once.

## 10. Project Structure

```
server/            Back end: Express API, Socket.IO, database models, tests
  src/models/        Database schemas
  src/routes/        Authentication, sessions, polls and questions
  src/middleware/    Authentication, rate limiting and validation
  src/services/      Result counting and lookup helpers
  tests/             Automated tests
client/            Front end: React application
  src/pages/         Landing, sign-in, dashboard, host, participant and projector views
  src/components/    Reusable interface components
docker-compose.yml Starts the database, server and nginx together
.github/workflows/ Automated checks that run on every push
```
