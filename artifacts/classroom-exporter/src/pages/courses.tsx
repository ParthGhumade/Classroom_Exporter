import { useLocation } from "wouter";
import { useListCourses, useGetAuthStatus, getListCoursesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FolderSymlink, Calendar, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function CoursesPage() {
  const [, setLocation] = useLocation();
  const { data: authStatus, isLoading: authLoading } = useGetAuthStatus();
  const { data: courses, isLoading: coursesLoading } = useListCourses({
    query: {
      queryKey: getListCoursesQueryKey(),
      enabled: !!authStatus?.authenticated,
    }
  });

  if (authLoading) return null;
  if (!authStatus?.authenticated) {
    setLocation("/");
    return null;
  }

  const handleCourseClick = (id: string, name: string) => {
    setLocation(`/export?courseId=${encodeURIComponent(id)}&courseName=${encodeURIComponent(name)}`);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Select Course</h1>
        <p className="text-muted-foreground text-lg">Choose a Google Classroom course to export files from.</p>
      </div>

      {coursesLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="overflow-hidden">
              <CardHeader className="pb-4">
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : courses?.length === 0 ? (
        <Card className="bg-muted/50 border-dashed text-center py-12">
          <CardContent>
            <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-medium mb-2">No courses found</h3>
            <p className="text-muted-foreground">We couldn't find any Google Classroom courses associated with this account.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses?.map((course) => (
            <Card 
              key={course.id} 
              className="cursor-pointer hover-elevate transition-all border-muted hover:border-primary/50 group"
              onClick={() => handleCourseClick(course.id, course.name)}
            >
              <CardHeader className="pb-4">
                <div className="flex justify-between items-start gap-4 mb-2">
                  <CardTitle className="text-xl line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                    {course.name}
                  </CardTitle>
                  <div className="p-2 bg-primary/10 text-primary rounded-lg shrink-0">
                    <FolderSymlink className="w-5 h-5" />
                  </div>
                </div>
                {course.section && (
                  <CardDescription className="text-sm font-medium">
                    {course.section}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <Badge variant={course.courseState === "ACTIVE" ? "default" : "secondary"} className="font-normal capitalize">
                    {course.courseState.toLowerCase()}
                  </Badge>
                  {course.creationTime && (
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{new Date(course.creationTime).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
