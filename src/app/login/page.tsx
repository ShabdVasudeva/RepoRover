
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Github, Loader2, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useToast } from "@/hooks/use-toast";
import { setGlobalGitConfigAction, loginWithPatAction } from "@/app/actions";

const loginFormSchema = z.object({
  name: z.string().min(1, "Name is required."),
  email: z.string().email("Invalid email address."),
  pat: z.string().min(1, "Personal Access Token is required."),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      name: "",
      email: "",
      pat: "",
    },
  });

  const handleLogin: SubmitHandler<LoginFormValues> = async (data) => {
    setIsProcessing(true);

    try {
      // Step 1: Set global git config
      const configResult = await setGlobalGitConfigAction(data.name, data.email);
      if (!configResult.success) {
        toast({
          title: "Git Configuration Failed",
          description: configResult.message || "Could not set global git name/email.",
          variant: "destructive",
        });
        setIsProcessing(false);
        return;
      }
      toast({
        title: "Git Configuration Successful",
        description: "Global git name and email have been set.",
      });

      // Step 2: Login with PAT
      const loginResult = await loginWithPatAction(data.pat, data.name, data.email);
      if (!loginResult.success) {
        toast({
          title: "Login Failed",
          description: loginResult.message || "Could not login with Personal Access Token.",
          variant: "destructive",
        });
        setIsProcessing(false);
        return;
      }
      
      toast({
        title: "Login Successful",
        description: "Successfully logged in with Personal Access Token.",
      });

      // Redirect to home page on successful login
      router.push('/');
      router.refresh(); // Ensures layout re-renders with new auth state

    } catch (error) {
      toast({
        title: "Login Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred during login.",
        variant: "destructive",
      });
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Github className="h-8 w-8" />
          </div>
          <CardTitle className="text-3xl font-bold">Welcome to RepoRover</CardTitle>
          <CardDescription className="text-muted-foreground">
            Configure Git and provide your GitHub Personal Access Token to login.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleLogin)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Commit Author Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Your Name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Commit Author Email</FormLabel>
                    <FormControl>
                      <Input placeholder="you@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GitHub Personal Access Token</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="ghp_YourTokenHere" {...field} />
                    </FormControl>
                    <FormMessage />
                     <p className="text-xs text-muted-foreground pt-1">
                      Requires <code className="bg-muted px-1 rounded-sm">repo</code>, <code className="bg-muted px-1 rounded-sm">read:user</code>, and <code className="bg-muted px-1 rounded-sm">user:email</code> scopes.
                    </p>
                  </FormItem>
                )}
              />
              <Button 
                type="submit" 
                disabled={isProcessing} 
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground text-base sm:text-md"
                size="lg"
              >
                {isProcessing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <KeyRound className="mr-2 h-5 w-5" />}
                Configure Git & Login with PAT
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        Your Name and Email will be used for `git config --global`.
        <br />
        Your Personal Access Token is used to authenticate with GitHub.
      </p>
    </div>
  );
}
