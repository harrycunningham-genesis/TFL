# London Tube Status Dashboard 🚇

A collaborative graduate project that uses Transport for London's Unified API to display the current status of London Underground lines.

The aim of the project is to build a simple, useful and extensible dashboard while giving everyone involved an opportunity to contribute to a shared software project.

---

## 📋 Project Overview

The dashboard currently:

* Displays London Underground lines
* Shows the current service status for each line
* Displays disruption information when available
* Automatically refreshes the data
* Allows the user to manually refresh the data
* Uses TfL's live Unified API
* Keeps the TfL API key in a local `.env` file

Future features can include:

* Official TfL line colours
* Improved disruption information
* Last updated timestamp
* Filtering and searching
* Dark mode
* Journey information
* Station information
* Tube network visualisation
* Historical service-status data
* Charts and statistics
* Accessibility improvements

---

# 🛠️ Technology

The current project uses:

* **React** — Frontend UI
* **Vite** — Development server and build tooling
* **JavaScript** — Application logic
* **CSS** — Styling
* **Git** — Version control
* **GitHub** — Collaboration and source control
* **TfL Unified API** — Live transport data

---

# 🚇 Where Does the Data Come From?

The dashboard uses **Transport for London's Unified API**.

TfL provides public transport data through its open-data programme. The Unified API provides access to datasets including current service status, disruptions, routes, stations, journey planning and arrival information.

More information can be found in TfL's official documentation:

* [TfL Unified API](https://tfl.gov.uk/info-for/open-data-users/unified-api)
* [TfL API Developer Portal](https://api-portal.tfl.gov.uk/)
* [TfL Open Data](https://tfl.gov.uk/info-for/open-data-users/)

### Current API endpoint

The dashboard currently requests Tube line status using:

```text
https://api.tfl.gov.uk/Line/Mode/tube/Status
```

The API key is supplied using the `app_key` query parameter.

For example:

```text
https://api.tfl.gov.uk/Line/Mode/tube/Status?app_key=YOUR_API_KEY
```

TfL's API is designed to provide current transport information from its underlying data sources. The information displayed by this project should therefore be treated as a snapshot of the data available from TfL at the time of the request.

---

# 🔑 API Key Setup

You will need access to a TfL API subscription key to run the project locally.

## 1. Get a TfL API key

Create an account through the TfL API Developer Portal:

https://api-portal.tfl.gov.uk/

Once you have created a subscription, TfL provides API keys through your profile.

**Never commit your API key to GitHub.**

---

## 2. Create the `.env` file

The `.env` file should be located in the root of the project:

```text
TFL/
├── .env
├── .gitignore
├── package.json
├── src/
│   ├── App.jsx
│   ├── App.css
│   └── index.css
└── ...
```

Add:

```env
VITE_TFL_API_KEY=your_api_key_here
```

Replace `your_api_key_here` with your actual TfL primary API key.

---

## 3. Make sure `.env` is ignored

Your `.gitignore` should contain:

```gitignore
.env
.env.local
.env.*.local
```

This is important because API keys and other secrets should **never be committed to the repository**.

If you accidentally commit an API key, notify the team and regenerate the key through the TfL API portal.

---

# 🚀 Getting Started

## Prerequisites

You will need:

* Git
* Node.js
* npm
* A GitHub account
* A TfL API key
* Visual Studio Code or another code editor

Check that Node.js is installed:

```bash
node --version
```

Check npm:

```bash
npm --version
```

Check Git:

```bash
git --version
```

---

# 📥 Getting the Project

Clone the repository:

```bash
git clone https://github.com/YOUR-ORGANISATION/YOUR-REPOSITORY.git
```

Enter the project:

```bash
cd YOUR-REPOSITORY
```

Install the dependencies:

```bash
npm install
```

Create your `.env` file:

```bash
touch .env
```

Then add:

```env
VITE_TFL_API_KEY=your_api_key_here
```

---

# ▶️ Running the Application

Start the development server:

```bash
npm run dev
```

Vite will provide a local URL, usually:

```text
http://localhost:5173
```

Open that address in your browser.

---

# 🧪 Building the Project

To create a production build:

```bash
npm run build
```

To preview the production build locally:

```bash
npm run preview
```

---

# 🌿 Git & GitHub Workflow

Because this is a collaborative project, please avoid working directly on `main`.

The recommended workflow is:

```text
main
 │
 ├── feature/line-colours
 ├── feature/dark-mode
 ├── feature/disruption-filter
 └── fix/api-error
```

## 1. Get the latest version

Before starting work:

```bash
git checkout main
git pull
```

## 2. Create a branch

Create a branch for your work:

```bash
git checkout -b feature/my-feature
```

Examples:

```bash
git checkout -b feature/line-colours
```

```bash
git checkout -b feature/dark-mode
```

```bash
git checkout -b fix/api-error
```

---

## 3. Make your changes

Open the project in VS Code:

```bash
code .
```

Make and test your changes.

---

## 4. Check what changed

```bash
git status
```

You can also see the actual changes with:

```bash
git diff
```

---

## 5. Commit your changes

Stage your changes:

```bash
git add .
```

Commit them:

```bash
git commit -m "Add Tube line colours"
```

Try to keep commit messages short and descriptive.

Examples:

```text
Add Tube line colours
Fix API loading state
Improve mobile layout
Add disruption filtering
Update project documentation
```

---

## 6. Push your branch

```bash
git push -u origin feature/my-feature
```

GitHub should then provide the option to create a Pull Request.

---

# 🔀 Pull Requests

Please use Pull Requests when merging work into `main`.

A good Pull Request should explain:

### What changed?

Example:

> Added official line colours to each Tube status card.

### Why?

Example:

> Makes it easier to identify each Tube line visually.

### How was it tested?

Example:

> Tested the dashboard locally using live TfL data and checked the layout at desktop and mobile widths.

### Screenshots

For UI changes, please include screenshots where useful.

---

# 🤝 Collaboration Guidelines

This project is intended to be collaborative.

Please:

* Create a branch before making changes
* Keep commits focused
* Keep Pull Requests reasonably small
* Test your changes before opening a PR
* Explain what your PR changes
* Review other people's Pull Requests
* Avoid committing secrets
* Avoid making large unrelated changes in the same PR
* Update documentation when introducing significant functionality

If you're working on a feature that could affect another person's work, communicate with them before making large changes.

---

# 📁 Project Structure

The project currently follows a simple structure:

```text
TFL/
│
├── public/
│
├── src/
│   ├── App.jsx
│   ├── App.css
│   └── index.css
│
├── .env                 # Local API key - NOT committed
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

As the project grows, we may introduce additional folders such as:

```text
src/
├── components/
├── services/
├── hooks/
├── utils/
└── pages/
```

---

# 🔐 Security

### Never commit:

```text
.env
.env.local
API keys
Passwords
Tokens
Credentials
Private configuration
```

The TfL API key should remain in your local `.env` file.

> **Important:** Because this application currently uses a `VITE_` environment variable, the API key is exposed to the browser when the application is built. This is acceptable for the current development setup but should be reconsidered before deploying a public production application.

A future version could move TfL API requests to a backend/API route so that the TfL key remains server-side.

---

# 📊 Current Data Flow

The application currently works roughly like this:

```text
┌──────────────────────┐
│   Transport for      │
│       London         │
│    Unified API       │
└──────────┬───────────┘
           │
           │ Live line status
           ▼
┌──────────────────────┐
│      React App       │
│                      │
│   fetch() request    │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│   Tube Status Cards  │
│                      │
│  Bakerloo  Good      │
│  Central   Good      │
│  Met       Delays    │
│  Northern  Good      │
└──────────────────────┘
```

The dashboard currently refreshes the data automatically every 60 seconds and also provides a manual refresh button.

---

# 💡 Future Work

Ideas for future contributors:

### UI

* [ ] Add official TfL line colours
* [ ] Improve responsive/mobile design
* [ ] Add dark mode
* [ ] Add loading animations
* [ ] Improve accessibility
* [ ] Add status icons
* [ ] Add last-updated timestamp

### Data

* [ ] Display more detailed disruption information
* [ ] Add station information
* [ ] Add arrival predictions
* [ ] Add journey planning
* [ ] Store historical status data
* [ ] Create service reliability charts

### Visualisation

* [ ] Add a Tube map
* [ ] Highlight disrupted lines on the map
* [ ] Add interactive stations
* [ ] Add geographical visualisations

### Engineering

* [ ] Separate API calls into a service layer
* [ ] Add reusable React components
* [ ] Add automated tests
* [ ] Add linting
* [ ] Add CI/CD
* [ ] Move API requests behind a backend
* [ ] Add error and retry handling

---

# 📚 Useful Resources

### Transport for London

* [TfL Unified API](https://tfl.gov.uk/info-for/open-data-users/unified-api)
* [TfL API Developer Portal](https://api-portal.tfl.gov.uk/)
* [TfL Open Data](https://tfl.gov.uk/info-for/open-data-users/)
* [TfL Open Data Terms](https://tfl.gov.uk/info-for/open-data-users/our-open-data)

### Development

* [React](https://react.dev/)
* [Vite](https://vite.dev/)
* [Git](https://git-scm.com/)
* [GitHub](https://github.com/)

---

# 📄 Licence & Data Attribution

This project uses open data provided by **Transport for London (TfL)**.

TfL states that its public data is released for developers to use in their own software and services, subject to its applicable terms and conditions.

Please review TfL's current open-data terms before distributing or deploying the application.

---

## 🚇 Let's build it together

The goal is not just to build a Tube dashboard, but to use the project as a way to learn and practise:

* Git
* GitHub
* React
* APIs
* JavaScript
* Frontend development
* Code reviews
* Pull Requests
* Collaborative software development

If you're unsure how to contribute, create an issue describing what you'd like to work on and discuss it with the team before starting.
