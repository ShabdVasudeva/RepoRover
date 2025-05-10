
"use client";

import { useState, useRef } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { cloneRepositoryAction, pushCodeAction } from '@/app/actions';
import { Github, GitFork, UploadCloud, FileCode, Loader2, Download } from 'lucide-react';

const cloneSchema = z.object({
  repoUrl: z.string().url({ message: "Invalid GitHub repository URL." }).startsWith("https://github.com/", { message: "URL must be a GitHub repository URL."}),
});

const pushSchema = z.object({
  zipFile: z.instanceof(File, { message: "Source code ZIP is required." })
    .refine(file => file.size > 0, "Source code ZIP is required.")
    .refine(file => file.type === 'application/zip' || file.type === 'application/x-zip-compressed', "File must be a ZIP archive."),
  targetRepoUrl: z.string().url({ message: "Invalid GitHub repository URL." }).startsWith("https://github.com/", { message: "URL must be a GitHub repository URL."}),
  branch: z.string().trim().min(1, { message: "Branch name cannot be empty and will be trimmed." }).default("main"),
  commitMessage: z.string().min(1, "Commit message is required."),
});

type CloneFormValues = z.infer<typeof cloneSchema>;
type PushFormValues = z.infer<typeof pushSchema>;

interface FeedbackMessage {
  type: 'info' | 'success' | 'error';
  content: string;
  timestamp: string;
}

export default function RepoRoverClientPage() {
  const [feedback, setFeedback] = useState<FeedbackMessage[]>([]);
  const [isCloning, setIsCloning] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();

  const cloneForm = useForm<CloneFormValues>({
    resolver: zodResolver(cloneSchema),
    defaultValues: {
      repoUrl: "",
    },
  });

  const pushForm = useForm<PushFormValues>({
    resolver: zodResolver(pushSchema),
    defaultValues: {
      targetRepoUrl: "",
      branch: "main",
      commitMessage: "",
    },
  });
  
  const addFeedback = (type: FeedbackMessage['type'], content: string) => {
    setFeedback(prev => [{ type, content, timestamp: new Date().toLocaleTimeString() }, ...prev ]);
  };

  const handleClone: SubmitHandler<CloneFormValues> = async (data) => {
    setIsCloning(true);
    addFeedback('info', `Cloning ${data.repoUrl}...`);
    try {
      const result = await cloneRepositoryAction(data.repoUrl);
      if (result.success) {
        addFeedback('success', result.message);
        if (result.zipFileName) {
          const downloadUrl = `/api/download-zip?fileName=${encodeURIComponent(result.zipFileName)}`;
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = result.zipFileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          addFeedback('info', `Download of ${result.zipFileName} initiated.`);
        }
        toast({ title: "Clone Operation Successful", description: result.message });
        cloneForm.reset();
      } else {
        addFeedback('error', `Clone failed: ${result.message}`);
        toast({ title: "Clone Failed", description: result.message, variant: "destructive" });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addFeedback('error', `Clone error: ${errorMessage}`);
      toast({ title: "Clone Error", description: errorMessage, variant: "destructive" });
    }
    setIsCloning(false);
  };

  const handlePush: SubmitHandler<PushFormValues> = async (data) => {
    setIsPushing(true);
    addFeedback('info', `Pushing code to ${data.targetRepoUrl} on branch ${data.branch}...`);
    
    const formData = new FormData();
    formData.append('zipFile', data.zipFile);
    formData.append('targetRepoUrl', data.targetRepoUrl);
    formData.append('branch', data.branch);
    formData.append('commitMessage', data.commitMessage); // Always send commit message

    try {
      const result = await pushCodeAction(formData);
      if (result.success) {
        addFeedback('success', `Code pushed successfully: ${result.message}`);
        toast({ title: "Push Successful", description: result.message });
        pushForm.reset(); 
        if(fileInputRef.current) fileInputRef.current.value = ""; 
      } else {
        addFeedback('error', `Push failed: ${result.message}`);
        toast({ title: "Push Failed", description: result.message, variant: "destructive" });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addFeedback('error', `Push error: ${errorMessage}`);
      toast({ title: "Push Error", description: errorMessage, variant: "destructive" });
    }
    setIsPushing(false);
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <Card className="shadow-lg rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl font-semibold"><GitFork className="h-7 w-7 text-accent" /> Clone Repository</CardTitle>
            <CardDescription>Paste a GitHub repository URL to clone. The ZIP file will download automatically, and local server copies will be cleaned up.</CardDescription>
          </CardHeader>
          <Form {...cloneForm}>
            <form onSubmit={cloneForm.handleSubmit(handleClone)}>
              <CardContent>
                <FormField
                  control={cloneForm.control}
                  name="repoUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base">Repository URL</FormLabel>
                      <FormControl>
                        <Input className="text-base" placeholder="https://github.com/user/repo.git" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
              <CardFooter>
                <Button type="submit" disabled={isCloning} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground text-base py-3">
                  {isCloning ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Download className="mr-2 h-5 w-5" />}
                  Clone & Download ZIP
                </Button>
              </CardFooter>
            </form>
          </Form>
        </Card>

        <Card className="shadow-lg rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl font-semibold"><UploadCloud className="h-7 w-7 text-accent" /> Push Local Code</CardTitle>
            <CardDescription>Upload a ZIP of your source code to push to a GitHub repository. Commits are made to a new or existing branch.</CardDescription>
          </CardHeader>
          <Form {...pushForm}>
            <form onSubmit={pushForm.handleSubmit(handlePush)}>
              <CardContent className="space-y-4">
                <FormField
                  control={pushForm.control}
                  name="zipFile"
                  render={({ field: { onChange, value, ...rest } }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1 text-base"><FileCode className="h-5 w-5"/> Source Code (ZIP)</FormLabel>
                      <FormControl>
                        <Input 
                          type="file" 
                          accept=".zip,application/zip,application/x-zip-compressed"
                          onChange={(e) => onChange(e.target.files?.[0])}
                          {...rest}
                          ref={fileInputRef}
                          className="file:text-foreground file:mr-2 file:py-2 file:px-3 file:rounded-md file:border file:border-input file:bg-background file:font-medium hover:file:bg-accent hover:file:text-accent-foreground text-base"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={pushForm.control}
                  name="targetRepoUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base">Target Repository URL</FormLabel>
                      <FormControl>
                        <Input className="text-base" placeholder="https://github.com/user/target-repo.git" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={pushForm.control}
                  name="branch"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base">Branch Name</FormLabel>
                      <FormControl>
                        <Input className="text-base" placeholder="main" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={pushForm.control}
                  name="commitMessage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base">Commit Message</FormLabel>
                      <FormControl>
                        <Textarea className="text-base" placeholder="Enter commit message" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
              <CardFooter>
                <Button type="submit" disabled={isPushing} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground text-base py-3">
                  {isPushing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <UploadCloud className="mr-2 h-5 w-5" />}
                  Push to GitHub
                </Button>
              </CardFooter>
            </form>
          </Form>
        </Card>
      </div>

      <Card className="shadow-lg rounded-xl lg:sticky lg:top-24 h-fit max-h-[calc(100vh-8rem)] flex flex-col">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">Output & Status</CardTitle>
          <CardDescription>Real-time feedback from operations. Newest messages appear at the top.</CardDescription>
        </CardHeader>
        <CardContent className="flex-grow overflow-hidden">
          <ScrollArea className="h-full max-h-[60vh] lg:max-h-full pr-4">
            {feedback.length === 0 && <p className="text-muted-foreground">No operations yet.</p>}
            {feedback.map((msg, index) => (
              <div key={index} className={`mb-3 p-3.5 rounded-lg text-sm shadow-md ${
                msg.type === 'error' ? 'bg-destructive/10 text-destructive border border-destructive/40' :
                msg.type === 'success' ? 'bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/40' :
                msg.type === 'info' ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/40' :
                'bg-secondary text-secondary-foreground border border-border'
              }`}>
                <span className="font-semibold block mb-1">[{msg.timestamp}] {msg.type.toUpperCase()}:</span>
                <pre className="whitespace-pre-wrap break-all font-mono text-xs">{msg.content}</pre>
              </div>
            ))}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
