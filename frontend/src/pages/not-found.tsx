import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="py-12 sm:py-20 flex items-center justify-center">
      <Card className="w-full max-w-md mx-auto rounded-2xl shadow-sm border-border/80">
        <CardContent className="pt-6 pb-6 text-center space-y-4">
          <div className="inline-flex p-3 bg-destructive/10 rounded-full text-destructive mb-1">
            <AlertCircle className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">404 Page Not Found</h1>
          <p className="text-sm text-muted-foreground">
            The page you are looking for doesn't exist or has moved.
          </p>
          <div className="pt-2">
            <Link href="/">
              <Button size="sm" className="h-9 px-4">
                Back to Home
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
