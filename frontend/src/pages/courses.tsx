import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { listCourses } from "@/lib/google-classroom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FolderSymlink,
  Calendar,
  BookOpen,
  AlertCircle,
  RefreshCw,
  Search,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function CoursesPage() {
  const [, setLocation] = useLocation();
  const { authenticated, accessToken, isLoading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");

  const {
    data: courses,
    isLoading: coursesLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["classroom_courses", accessToken],
    queryFn: () => listCourses(accessToken!),
    enabled: authenticated && Boolean(accessToken),
  });

  const filteredCourses = useMemo(() => {
    if (!courses) return [];
    if (!searchQuery.trim()) return courses;
    const q = searchQuery.toLowerCase();
    return courses.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.section && c.section.toLowerCase().includes(q)) ||
        (c.descriptionHeading && c.descriptionHeading.toLowerCase().includes(q))
    );
  }, [courses, searchQuery]);

  if (authLoading) return null;
  if (!authenticated) {
    setLocation("/");
    return null;
  }

  const handleCourseClick = (id: string, name: string) => {
    setLocation(`/export?courseId=${encodeURIComponent(id)}&courseName=${encodeURIComponent(name)}`);
  };

  return (
    <div className="space-y-5 sm:space-y-6 animate-in fade-in duration-300">

      {/* Header and Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Select Course</h1>
          <p className="text-muted-foreground text-sm sm:text-base mt-0.5">
            Choose a Google Classroom course to export files from.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2 shrink-0 self-start sm:self-auto h-9 text-xs sm:text-sm active:scale-95 transition-all touch-manipulation"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          <span>{isFetching ? "Refreshing..." : "Refresh"}</span>
        </Button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by course name or section..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 pr-4 h-10 text-sm bg-card border-border/80 shadow-2xs rounded-xl"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground p-1 cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {/* Course List / States */}
      {error ? (
        <Card className="border-destructive/30 bg-destructive/5 p-5 sm:p-6 rounded-2xl">
          <div className="flex items-center gap-2.5 text-destructive mb-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <h3 className="font-semibold text-base sm:text-lg">
              {(error as Error).message.includes("classroom.googleapis.com")
                ? "Google Classroom API is not enabled"
                : "Failed to load courses"}
            </h3>
          </div>
          <p className="text-muted-foreground mb-4 text-xs sm:text-sm whitespace-pre-line leading-relaxed">
            {(error as Error).message}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            {(error as Error).message.includes("classroom.googleapis.com") && (
              <a
                href="https://console.developers.google.com/apis/api/classroom.googleapis.com/overview?project=970071174800"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors"
              >
                <span>Enable Classroom API</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </a>
            )}
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Try Again
            </Button>
          </div>
        </Card>
      ) : coursesLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="rounded-xl overflow-hidden">
              <CardHeader className="p-4 sm:p-5 pb-3">
                <Skeleton className="h-5 w-3/4 mb-2" />
                <Skeleton className="h-3.5 w-1/2" />
              </CardHeader>
              <CardContent className="p-4 sm:p-5 pt-0">
                <div className="flex gap-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredCourses.length === 0 ? (
        <Card className="bg-muted/30 border-dashed text-center py-10 sm:py-12 rounded-2xl">
          <CardContent className="px-4">
            <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-lg font-semibold mb-1">
              {searchQuery ? "No matching courses" : "No courses found"}
            </h3>
            <p className="text-muted-foreground text-xs sm:text-sm max-w-sm mx-auto">
              {searchQuery
                ? `No courses matching "${searchQuery}". Try a different search.`
                : "We couldn't find any Google Classroom courses associated with this account."}
            </p>
            {searchQuery && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4 text-xs"
                onClick={() => setSearchQuery("")}
              >
                Clear Search
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-5">
          {filteredCourses.map((course) => (
            <Card
              key={course.id}
              className="cursor-pointer hover:border-primary/50 border-border/80 bg-card hover:bg-muted/20 active:scale-[0.98] transition-all duration-150 group rounded-xl shadow-2xs touch-manipulation flex flex-col justify-between"
              onClick={() => handleCourseClick(course.id, course.name)}
            >
              <CardHeader className="p-4 sm:p-5 pb-3">
                <div className="flex justify-between items-start gap-3 mb-1">
                  <CardTitle className="text-base sm:text-lg line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                    {course.name}
                  </CardTitle>
                  <div className="p-1.5 sm:p-2 bg-primary/10 text-primary rounded-lg shrink-0 group-hover:bg-primary/20 transition-colors">
                    <FolderSymlink className="w-4 h-4" />
                  </div>
                </div>
                {course.section && (
                  <CardDescription className="text-xs sm:text-sm font-medium line-clamp-1">
                    {course.section}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="p-4 sm:p-5 pt-0">
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={course.courseState === "ACTIVE" ? "default" : "secondary"}
                      className="text-[11px] font-normal capitalize py-0 px-2"
                    >
                      {course.courseState.toLowerCase()}
                    </Badge>
                    {course.creationTime && (
                      <div className="hidden sm:flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>{new Date(course.creationTime).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
