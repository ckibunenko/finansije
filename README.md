# Store Finance Tracker

A web app for tracking a store's monthly budget. It helps you enter daily
expenses, compare spending against the planned budget, track a monthly savings
goal, review charts, and import/export data as a JSON file.

## Requirements

Before you start, make sure you have:

- Git
- Node.js 20 or newer
- npm

Check your installed versions:

```bash
node -v
npm -v
git --version
```

If Node.js is not installed, use Node.js 20 LTS or a newer version.

## Download The Project

Clone the repository:

```bash
git clone https://github.com/ckibunenko/finansije.git
```

Open the project folder:

```bash
cd finansije
```

## Install Dependencies

Install the project dependencies:

```bash
npm install
```

For a clean install that follows `package-lock.json` exactly, use:

```bash
npm ci
```

`npm ci` is a good choice for clean local setups and CI/CD environments.

## Run The App Locally

Start the development server:

```bash
npm run dev
```

The terminal will print a local URL. It is usually:

```text
http://localhost:5173/
```

Open that URL in your browser.

## How To Use The App

1. Select a month using the month picker or the previous/next month buttons.
2. Enter the planned monthly budget.
3. Optionally enter a monthly savings goal.
4. Select the date you want to update.
5. Enter the daily expense.
6. Click the save button.

Daily expense examples:

```text
5400
```

sets the total expense for the selected day to 5400 RSD.

```text
+1400
```

adds 1400 RSD to the existing expense for the selected day.

If you leave the daily expense field empty and click the save button, the entry
for that day is deleted.

## Data Storage

Data is saved locally in the browser using `localStorage`. This means:

- data stays saved in the same browser on the same computer
- data is not sent to a server
- another browser or another computer will not automatically have the same data

To move or back up data, use:

- `Export JSON` to download a backup file
- `Import JSON` to load a previously exported file

## Production Build

Create a production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

The terminal will print the preview URL.

## Common Issues

If `npm install` or `npm run dev` does not work, check your Node.js version:

```bash
node -v
```

Use Node.js 20 or newer.

If port `5173` is already in use, Vite will offer another port. Open the URL
printed in the terminal.

If you want a completely fresh dependency install, delete your local
`node_modules` folder and run:

```bash
npm install
```
