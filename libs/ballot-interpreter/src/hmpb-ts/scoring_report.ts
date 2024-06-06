/* istanbul ignore file */
import { assert, unique } from '@votingworks/basics';
import {
  ElectionDefinition,
  SheetOf,
  safeParseElectionDefinition,
} from '@votingworks/types';
import { mkdir, readFile, readdir } from 'fs/promises';
import { ImageData, writeImageData } from '@votingworks/image-utils';
import { basename, join } from 'path';
import { CanvasRenderingContext2D, createCanvas } from 'canvas';
import { interpret } from './interpret';
import { InterpretedBallotPage } from './types';

interface ImagePathSheet {
  sheetName: string;
  pageImagePaths: SheetOf<string>;
}

function pairBallotImagePaths(ballotImagePaths: string[]): ImagePathSheet[] {
  // For now, we expect ballot images to have "-front" or "-back" in the name.
  // We could extend this if we encounter ballot images with other naming
  // schemes.
  const frontPaths = ballotImagePaths.filter((path) => path.match(/-front/));
  const backPaths = ballotImagePaths.filter((path) => path.match(/-back/));
  const sheetNames = unique([
    ...frontPaths.map((path) =>
      basename(path).replace(/-front\.(jpg|jpeg|png)$/, '')
    ),
    ...backPaths.map((path) =>
      basename(path).replace(/-back\.(jpg|jpeg|png)$/, '')
    ),
  ]);
  return sheetNames.flatMap((sheetName) => {
    const frontPath = frontPaths.find((path) => path.includes(sheetName));
    if (!frontPath) {
      process.stderr.write(`No front image found for ${sheetName}\n`);
      return [];
    }
    const backPath = backPaths.find((path) => path.includes(sheetName));
    if (!backPath) {
      process.stderr.write(`No back image found for ${sheetName}\n`);
      return [];
    }
    return [
      {
        sheetName,
        pageImagePaths: [frontPath, backPath],
      },
    ];
  });
}

function formatScore(score: number): string {
  return `${Math.round(score * 10_000) / 100}%`;
}

function fillTextWithBackground({
  context,
  text,
  x,
  y,
  backgroundColor,
  textColor,
}: {
  context: CanvasRenderingContext2D;
  text: string;
  x: number;
  y: number;
  backgroundColor: string;
  textColor: string;
}) {
  const padding = 8;
  const { width, actualBoundingBoxAscent, actualBoundingBoxDescent } =
    context.measureText(text);
  const height = actualBoundingBoxAscent + actualBoundingBoxDescent;
  context.fillStyle = backgroundColor;
  context.fillRect(
    x - padding,
    y - padding,
    width + 2 * padding,
    height + 2 * padding
  );
  context.fillStyle = textColor;
  context.fillText(text, x, y + actualBoundingBoxAscent);
}

function annotateBallotImageScores(
  scoreType: 'marks' | 'write-ins',
  ballotImage: ImageData,
  interpretation: InterpretedBallotPage
): ImageData {
  const canvas = createCanvas(ballotImage.width, ballotImage.height);
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = false;
  context.putImageData(ballotImage, 0, 0);
  context.font = '32px sans-serif bold';

  const lineWidth = 2;
  const boxPadding = 1;

  if (scoreType === 'marks') {
    const markColor = 'darkred';
    for (const [, mark] of interpretation.marks) {
      if (!mark) continue;
      const { matchedBounds: bounds, fillScore } = mark;
      context.strokeStyle = markColor;
      context.lineWidth = 2;
      context.strokeRect(
        bounds.left + boxPadding,
        bounds.top + boxPadding,
        bounds.width + boxPadding,
        bounds.height + boxPadding
      );

      fillTextWithBackground({
        context,
        text: formatScore(fillScore),
        x: bounds.left + 7,
        y: bounds.top + bounds.height + 15,
        backgroundColor: markColor,
        textColor: 'white',
      });
    }
  }

  if (scoreType === 'write-ins') {
    const writeInColor = 'darkgreen';
    for (const writeIn of interpretation.writeIns) {
      const { bounds, score } = writeIn;
      context.strokeStyle = writeInColor;
      context.lineWidth = lineWidth;
      context.strokeRect(
        bounds.left + boxPadding,
        bounds.top + boxPadding,
        bounds.width + boxPadding,
        bounds.height + boxPadding
      );

      const scoreText = formatScore(score);
      fillTextWithBackground({
        context,
        text: scoreText,
        x: bounds.left - context.measureText(scoreText).width - 15,
        y: bounds.top,
        backgroundColor: writeInColor,
        textColor: 'white',
      });
    }
  }

  return context.getImageData(0, 0, canvas.width, canvas.height);
}

async function generateScoringReport(
  scoreType: 'marks' | 'write-ins',
  electionDefinition: ElectionDefinition,
  ballotImagePaths: string[],
  outputDir: string
): Promise<void> {
  const ballotImageSheets = pairBallotImagePaths(ballotImagePaths);

  for (const { sheetName, pageImagePaths: imagePaths } of ballotImageSheets) {
    process.stdout.write(`Scoring sheet ${sheetName}\n`);
    const interpretationResult = interpret(electionDefinition, imagePaths, {
      scoreWriteIns: true,
    });
    if (!interpretationResult.isOk()) {
      process.stderr.write(
        `Failed to interpret sheet ${sheetName}:\n${JSON.stringify(
          interpretationResult.err(),
          null,
          2
        )}\n`
      );
      continue;
    }
    const interpretation = interpretationResult.ok();

    const frontScoredImage = annotateBallotImageScores(
      scoreType,
      interpretation.front.normalizedImage,
      interpretation.front
    );
    const backScoredImage = annotateBallotImageScores(
      scoreType,
      interpretation.back.normalizedImage,
      interpretation.back
    );
    const frontOutputPath = join(outputDir, `${sheetName}-front.jpg`);
    const backOutputPath = join(outputDir, `${sheetName}-back.jpg`);
    await writeImageData(frontOutputPath, frontScoredImage);
    await writeImageData(backOutputPath, backScoredImage);
  }
}

export async function main(args: string[]): Promise<void> {
  const usage = `Usage: scoring_report -w|-m <election.json> <input-ballot-images-dir> <output-dir>
  -m  Score marks
  -w  Score write-ins
  `;
  if (args.length !== 4) {
    throw new Error(usage);
  }

  const [scoreFlag, electionPath, inputDir, outputDir] = args;
  assert(scoreFlag !== undefined);
  assert(electionPath !== undefined);
  assert(inputDir !== undefined);
  assert(outputDir !== undefined);

  const scoreType = (
    {
      '-m': 'marks',
      '-w': 'write-ins',
    } as const
  )[scoreFlag];
  if (!scoreType) {
    throw new Error(usage);
  }

  const electionDefinition = safeParseElectionDefinition(
    await readFile(electionPath, 'utf8')
  ).unsafeUnwrap();

  const ballotImagePaths = (await readdir(inputDir))
    .filter((path) => path.match(/\.(jpg|jpeg|png)$/))
    .map((path) => join(inputDir, path));
  if (ballotImagePaths.length === 0) {
    throw new Error(`No ballot images found in ${inputDir}`);
  }

  await mkdir(outputDir, { recursive: true });

  await generateScoringReport(
    scoreType,
    electionDefinition,
    ballotImagePaths,
    outputDir
  );
}
