
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getSessionFromRequest } from '@/lib/auth';

const ZIPPED_REPOS_DIR = path.join(process.cwd(), 'zipped_repos');

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const fileName = searchParams.get('fileName');

  if (!fileName) {
    return NextResponse.json({ error: 'File name is required' }, { status: 400 });
  }

  // Basic sanitization to prevent directory traversal
  if (fileName.includes('..') || fileName.includes('/') || !fileName.endsWith('.zip')) {
    return NextResponse.json({ error: 'Invalid file name or type' }, { status: 400 });
  }

  const filePath = path.join(ZIPPED_REPOS_DIR, fileName);

  try {
    await fs.access(filePath); // Check if file exists
  } catch (error) {
    console.error(`File not found: ${filePath}`, error);
    return NextResponse.json({ error: 'File not found or access denied' }, { status: 404 });
  }

  let fileBuffer;
  try {
    fileBuffer = await fs.readFile(filePath);
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return NextResponse.json({ error: 'Error processing file' }, { status: 500 });
  }
  
  const headers = new Headers();
  headers.set('Content-Type', 'application/zip');
  headers.set('Content-Disposition', `attachment; filename="${fileName}"`);

  // Construct the response with the file buffer
  const response = new NextResponse(fileBuffer, { status: 200, headers });

  // Attempt to delete the file after the response object is created.
  // This is a "best effort" cleanup. If the server crashes during this, 
  // or if the unlink fails for permission reasons, the file might remain.
  try {
    await fs.unlink(filePath);
    console.log(`Successfully deleted ${filePath} from server after preparing for download.`);
  } catch (deleteError) {
    console.error(`Error deleting file ${filePath} after download attempt:`, deleteError);
    // Do not fail the download if deletion fails; just log the error.
  }

  return response;
}

