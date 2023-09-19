import { test } from '@playwright/test';
import path from 'path';
import {
  enterPin,
  logOutAndResetElectionDefinition,
  mockCardRemoval,
  mockSystemAdministratorCardInsertion,
} from './support/auth';

test.beforeEach(async ({ page }) => {
  await logOutAndResetElectionDefinition(page);
});

test('configuration from MS SEMS files', async ({ page }) => {
  await page.goto('/');
  mockSystemAdministratorCardInsertion();
  await enterPin(page);
  mockCardRemoval();
  await page.click('text=Convert from SEMS files');
  await page
    .getByLabel('SEMS main file')
    .setInputFiles(path.join(__dirname, '../fixtures/semsMainFile.txt'));
  await page
    .getByLabel('SEMS candidate mapping file')
    .setInputFiles(
      path.join(__dirname, '../fixtures/semsCandidateMappingFile.txt')
    );
  await page.waitForSelector('text=Special Election for Senate 15');
  // The page renders twice when first loaded, make sure that is done before we navigate.
  await page.click('text=Definition');
  await page.click('text=View Definition JSON');
  await page.waitForSelector('text=State Senate 15');
  await page.waitForSelector('text=District 15');
  await page.click('text=Remove');
  await page.click('text=Remove Election Definition');
});
