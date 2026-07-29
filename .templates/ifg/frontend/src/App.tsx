import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route } from 'react-router-dom';
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnimatedRoutes } from "@/components/AnimatedRoutes";
import { PageTransition } from "@/components/PageTransition";
import { StoryProvider } from "@/engine/StoryContext";
import TitleScreen from "./pages/TitleScreen";
import PlayScreen from "./pages/PlayScreen";
import GalleryScreen from "./pages/GalleryScreen";
import NotFound from "./pages/NotFound";

/**
 * Configure TanStack Query client with optimized defaults
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data considered fresh for 1 minute
      staleTime: 60 * 1000,
      // Cache data for 5 minutes
      gcTime: 5 * 60 * 1000,
      // Retry failed requests once
      retry: 1,
      // Don't refetch on window focus by default
      refetchOnWindowFocus: false,
      // Don't refetch on reconnect by default
      refetchOnReconnect: false,
    },
    mutations: {
      // Retry failed mutations once
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <BrowserRouter>
          <StoryProvider>
            <AnimatedRoutes>
              <Route path="/" data-genie-title="标题" data-genie-key="Title" element={<PageTransition transition="fade"><TitleScreen /></PageTransition>} />
              <Route path="/play" data-genie-title="播放" data-genie-key="Play" element={<PageTransition transition="fade"><PlayScreen /></PageTransition>} />
              <Route path="/gallery" data-genie-title="结局图鉴" data-genie-key="Gallery" element={<PageTransition transition="slide-up"><GalleryScreen /></PageTransition>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" data-genie-key="NotFound" data-genie-title="Not Found" element={<PageTransition transition="fade"><NotFound /></PageTransition>} />
            </AnimatedRoutes>
          </StoryProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App
