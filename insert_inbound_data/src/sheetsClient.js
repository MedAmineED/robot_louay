import { readFile } from 'node:fs/promises';
import { google } from 'googleapis';
import { config } from './config.js';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

/** Authenticate with the service account and return a Sheets API client. */
export async function createSheetsClient() {
  const credentials = JSON.parse(await readFile(config.credentialsPath, 'utf8'));

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: SCOPES,
  });

  return google.sheets({ version: 'v4', auth: await auth.getClient() });
}
