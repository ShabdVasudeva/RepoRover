
"use server";

import { execa } from 'execa';
import fs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
// import { generateCommitMessage } from '@/ai/flows/generate-commit-message'; // Removed AI feature
import { getSession, deleteSession, createSession, type UserSessionPayload } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';


const REPO_BASE_DIR = path.join(process.cwd(), 'cloned_repos');
const ZIPPED_REPOS_DIR = path.join(process.cwd(), 'zipped_repos');
const UPLOAD_TEMP_DIR = path.join(process.cwd(), 'temp_uploads');
const GIT_CONFIG_CWD = process.cwd(); // For global git config operations

async function ensureDir(dirPath: string) {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

export async function setGlobalGitConfigAction(name: string, email: string): Promise<{ success: boolean; message: string }> {
  if (!name || !email) {
    return { success: false, message: "Name and email are required for Git configuration." };
  }
  try {
    console.log(`Attempting to set git global user.name to: ${name}`);
    await execa('git', ['config', '--global', 'user.name', name], { cwd: GIT_CONFIG_CWD });
    console.log(`Attempting to set git global user.email to: ${email}`);
    await execa('git', ['config', '--global', 'user.email', email], { cwd: GIT_CONFIG_CWD });
    console.log('Global git user.name and user.email configured successfully.');
    return { success: true, message: "Global git user.name and user.email configured successfully." };
  } catch (error: any) {
    console.error('Failed to configure global git user:', error.stderr || error.message);
    return { success: false, message: `Failed to configure global git user: ${error.stderr || error.message}` };
  }
}

export async function loginWithPatAction(pat: string, formName: string, formEmail: string): Promise<{ success: boolean; message?: string }> {
  if (!pat) {
    return { success: false, message: "Personal Access Token is required." };
  }

  try {
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `token ${pat}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!userResponse.ok) {
      const errorData = await userResponse.json().catch(() => ({}));
      const message = errorData.message || `Failed to verify PAT. Status: ${userResponse.status}`;
      console.error('GitHub PAT verification error:', message, errorData);
      return { success: false, message: `Invalid Personal Access Token or insufficient scopes (requires read:user). ${message}` };
    }

    const githubUserData = await userResponse.json();

    if (!githubUserData.id || !githubUserData.login) {
        console.error('Failed to fetch valid user data from GitHub with PAT');
        return { success: false, message: 'Failed to fetch user data using PAT. Token might be malformed or lack `read:user` scope.' };
    }
    
    let primaryEmail = formEmail; 
    const emailResponse = await fetch('https://api.github.com/user/emails', {
        headers: {
          Authorization: `token ${pat}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });
    
    if (emailResponse.ok) {
        const emailsData = await emailResponse.json();
        const githubPrimaryEmail = emailsData.find((email: any) => email.primary && email.verified)?.email;
        if (githubPrimaryEmail) {
            primaryEmail = githubPrimaryEmail;
        } else if (githubUserData.email) { 
            primaryEmail = githubUserData.email; 
        }
    } else {
        console.warn("Could not fetch user emails with PAT (requires user:email scope), will use provided email for session or public profile email if available.");
         if (githubUserData.email) { 
            primaryEmail = githubUserData.email;
        }
    }

    const sessionPayload: UserSessionPayload = {
      userId: String(githubUserData.id),
      name: githubUserData.login, 
      email: primaryEmail, 
      accessToken: pat,
    };

    await createSession(sessionPayload);
    return { success: true, message: "Logged in successfully." };

  } catch (error) {
    console.error('Login with PAT error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during PAT login.';
    return { success: false, message: errorMessage };
  }
}


export async function cloneRepositoryAction(repoUrl: string): Promise<{ success: boolean; message:string; zipFileName?: string }> {
  const session = await getSession();
  if (!session?.accessToken) {
    return { success: false, message: 'User not authenticated or access token missing.' };
  }

  let targetPath: string | undefined;
  let repoName: string | undefined;

  try {
    if (!repoUrl || !repoUrl.startsWith('https://github.com/')) {
      return { success: false, message: 'Invalid GitHub repository URL.' };
    }
    
    await ensureDir(REPO_BASE_DIR);
    await ensureDir(ZIPPED_REPOS_DIR);
    
    repoName = new URL(repoUrl).pathname.split('/').pop()?.replace('.git', '') || `repo-${Date.now()}`;
    targetPath = path.join(REPO_BASE_DIR, repoName);
    let cloneNeeded = true;

    try {
      await fs.access(targetPath); 
      try {
          await execa('git', ['rev-parse', '--is-inside-work-tree'], { cwd: targetPath });
          cloneNeeded = false; 
      } catch (gitError) {
          console.warn(`Directory ${targetPath} exists but is not a git repository or is problematic. Cleaning and re-cloning.`);
          await fs.rm(targetPath, { recursive: true, force: true });
      }
    } catch (e: any) {
        if (e.code !== 'ENOENT') {
            throw e;
        }
    }
    
    let operationSummary = cloneNeeded ? "Repository cloning initiated." : "Repository was already present.";

    if (cloneNeeded) {
      const repoPathOnly = new URL(repoUrl).pathname.substring(1).replace(/\.git$/, ''); 
      const authenticatedRepoUrl = `https://oauth2:${session.accessToken}@github.com/${repoPathOnly}.git`;
          
      const { stdout, stderr } = await execa('git', ['clone', authenticatedRepoUrl, targetPath]);
      
      if (stderr && !stderr.toLowerCase().includes('cloning into') && !stderr.toLowerCase().includes('already exists and is not an empty directory')) {
        console.warn(`Clone stderr for ${repoUrl}: ${stderr}`);
      }
      operationSummary = `Repository cloned successfully.`;
    }

    const zip = new AdmZip();
    if (!targetPath) { 
        return { success: false, message: "Internal error: target path for zipping is undefined."};
    }
    zip.addLocalFolder(targetPath);
    const zipFileName = `${repoName}.zip`;
    const zipFilePath = path.join(ZIPPED_REPOS_DIR, zipFileName);
    await zip.writeZipPromise(zipFilePath);
    operationSummary += ` Zipped as ${zipFileName}.`;

    try {
        await fs.rm(targetPath, { recursive: true, force: true });
        console.log(`Cleaned up cloned repository at ${targetPath}`);
        operationSummary += ` Original cloned files have been cleaned up.`;
    } catch (cleanupError: any) {
        console.warn(`Failed to clean up cloned repository at ${targetPath}: ${cleanupError.message}`);
        operationSummary += ` Warning: Failed to clean up original cloned files.`;
    }
    
    return { success: true, message: operationSummary, zipFileName: zipFileName };

  } catch (error: any) {
    console.error('Clone error:', error);
    let errMsg = `Failed to clone or zip repository: ${error.stderr || error.message || error.shortMessage || 'Unknown error'}`;
    if (error.stderr?.includes('Authentication failed')) {
        errMsg = 'Failed to clone repository: Authentication failed. Your GitHub PAT might be invalid, expired, or lack permissions for this repository.';
    } else if (error.stderr?.includes('not found')) {
        errMsg = `Failed to clone repository: Repository not found at ${repoUrl}. Check the URL and permissions.`;
    }
    if (targetPath) {
      try {
        await fs.access(targetPath); 
        await fs.rm(targetPath, { recursive: true, force: true });
        console.log(`Cleaned up ${targetPath} after error.`);
      } catch (cleanupError: any) {
        console.warn(`Failed to clean up ${targetPath} after error: ${cleanupError.message}`);
      }
    }
    return { success: false, message: errMsg };
  }
}

export async function pushCodeAction(formData: FormData): Promise<{ success: boolean; message: string }> {
  const session = await getSession();
  if (!session?.name || !session?.email || !session?.accessToken) { 
    return { success: false, message: 'User not fully authenticated or session data incomplete.' };
  }
  
  const { name: githubUserName, email: githubUserEmail, accessToken } = session;

  const zipFile = formData.get('zipFile') as File | null;
  const targetRepoUrl = formData.get('targetRepoUrl') as string | null;
  const rawBranchFromForm = formData.get('branch') as string | null;
  let commitMessage = formData.get('commitMessage') as string | null;

  if (!zipFile || zipFile.size === 0) return { success: false, message: "No source code ZIP file provided." };
  if (!targetRepoUrl) return { success: false, message: "Target repository URL is required." };
  
  if (!rawBranchFromForm) {
    return { success: false, message: "Branch name is required." };
  }
  const branch = rawBranchFromForm.trim();
  if (branch === "") {
    return { success: false, message: "Branch name cannot be empty after trimming spaces." };
  }

  if (!commitMessage) return { success: false, message: "Commit message is required." };

  await ensureDir(UPLOAD_TEMP_DIR);
  const tempDirName = `upload-${Date.now()}`;
  const tempDirPath = path.join(UPLOAD_TEMP_DIR, tempDirName);
  
  try {
    await fs.mkdir(tempDirPath, { recursive: true });

    const fileBuffer = Buffer.from(await zipFile.arrayBuffer());
    const zip = new AdmZip(fileBuffer);
    zip.extractAllTo(tempDirPath, /*overwrite*/ true);

    const git = async (...args: string[]) => {
      console.log(`Executing: git ${args.join(' ')} in ${tempDirPath}`);
      return execa('git', args, { cwd: tempDirPath });
    };
    
    await git('init');
    
    await git('config', 'user.name', githubUserName); 
    await git('config', 'user.email', githubUserEmail);

    const targetRepoPathOnly = new URL(targetRepoUrl).pathname.substring(1).replace(/\.git$/, '');
    const authenticatedTargetRepoUrl = `https://${githubUserName}:${accessToken}@github.com/${targetRepoPathOnly}.git`;
    
    await git('remote', 'add', 'origin', authenticatedTargetRepoUrl);

    await git('add', '.'); 

    // Check for empty zip/no committable files before attempting commit
    const { stdout: statusOutputBeforeCommit } = await git('status', '--porcelain');
     if (!statusOutputBeforeCommit.trim()) {
        const { stdout: lsFilesOutput } = await git('ls-files');
        if (!lsFilesOutput.trim()) {
            return { success: false, message: "Push failed: The provided ZIP file seems to be empty or contains no committable files after staging." };
        }
        // If there are files but no changes (e.g., all files are gitignored or already committed in a previous identical state)
        // then a commit might still be valid if --allow-empty is used, or if it's an initial commit.
        // However, without staged changes, a normal commit will fail.
        console.warn("No changes to commit based on git status, but files are present. Proceeding with commit attempt.");
    }


    await git('commit', '-m', commitMessage, '--allow-empty'); 
    
    await git('branch', '-M', branch);
    
    let remoteBranchExists = false;
    try {
      await git('ls-remote', '--exit-code', '--heads', 'origin', branch);
      remoteBranchExists = true;
    } catch (e: any) {
       if (e.exitCode === 2) { 
         remoteBranchExists = false; 
       } else {
         throw e; 
       }
    }

    if (remoteBranchExists) {
        try {
            await git('fetch', 'origin', branch);
            await git('branch', `--set-upstream-to=origin/${branch}`, branch);
        } catch (fetchRebaseError: any) {
            console.warn(`Failed to fetch/set-upstream before push (branch: ${branch}): ${fetchRebaseError.stderr || fetchRebaseError.message}. Proceeding with push attempt.`);
        }
    }
    
    await git('push', '--set-upstream', 'origin', branch);


    return { success: true, message: `Code pushed successfully to ${targetRepoUrl} on branch ${branch} with commit: "${commitMessage}"` };

  } catch (error: any)
  {
    console.error('Push error:', error);
    let errorMessage = `Failed to push code: ${error.stderr || error.message || error.shortMessage || 'Unknown error'}`;
    if (error.stderr) {
      if (error.stderr.includes('non-fast-forward')) {
        errorMessage = `Push failed due to non-fast-forward updates. Please ensure your local branch '${branch}' is up-to-date with the remote, or try pushing to a new branch. You might need to pull and merge changes.`;
      } else if (error.stderr.includes('Authentication failed')) {
        errorMessage = `Push failed: Authentication failed. Your GitHub PAT might be invalid, expired, or lack push permissions for this repository.`;
      } else if (error.stderr.includes('src refspec') && error.stderr.includes('does not match any')) {
        errorMessage = `Push failed: Git could not find the local source branch '${branch}' to push. This might happen if the branch name is incorrect, if the branch was not created properly, or if there were no commits made.`;
      } else if (error.stderr.includes('remote end hung up unexpectedly')) {
         errorMessage = `Push failed: Remote end hung up unexpectedly. This could be due to a large push, network issues, or server-side limits.`;
      } else if (error.stderr.includes('everything up-to-date')) {
        errorMessage = `Push failed: Everything is up-to-date. No new changes to push to branch '${branch}'.`;
      }
    } else if (error.message?.includes('ENOENT') && error.command?.includes('git commit')) {
        errorMessage = `Push failed: Commit step failed. This might be due to an empty repository with no files to commit. Please ensure your ZIP file contains files.`;
    } else if (error.message?.includes('failed with exit code 1') && error.command?.includes('git commit') && !error.stderr?.includes('nothing to commit')) {
        // This can happen if `git add .` stages nothing (e.g. empty zip or all .gitignored files)
        // and then `git commit` is run without `--allow-empty`. Even with `--allow-empty`, if there are truly no files tracked.
        errorMessage = `Push failed: Commit step failed, possibly because there were no changes to commit. Ensure your ZIP contains files and they are not all gitignored.`;
    }
    return { success: false, message: errorMessage };
  } finally {
    if (tempDirPath) {
      try {
        await fs.rm(tempDirPath, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error(`Failed to clean up temporary directory ${tempDirPath}:`, cleanupError);
      }
    }
  }
}

export async function logoutAction() {
  await deleteSession();
  revalidatePath('/', 'layout'); 
  redirect('/login');
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session?.userId) { 
    return null;
  }
  return session; 
}

