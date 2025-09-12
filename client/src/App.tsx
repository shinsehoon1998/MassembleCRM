import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import Customers from "@/pages/Customers";
import CustomerDetail from "@/pages/CustomerDetail";
import DataImport from "@/pages/DataImport";
import ArsCampaigns from "@/pages/ArsCampaigns";
import ScenarioManagement from "@/pages/ScenarioManagement";
import CustomerGroups from "@/pages/CustomerGroups";
import Users from "@/pages/Users";
import Settings from "@/pages/Settings";
import Layout from "@/components/Layout";
import NotFound from "@/pages/not-found";

// Component to redirect unauthenticated users to login while preserving intended destination
function RedirectToLogin() {
  const [location] = useLocation();
  
  // Only redirect if not already on login or register pages
  if (location !== '/login' && location !== '/register' && location !== '/') {
    // Store the intended destination for post-login redirect
    const redirectUrl = `/login?redirectTo=${encodeURIComponent(location)}`;
    return <Redirect to={redirectUrl} />;
  }
  
  // For root path, just go to login
  return <Redirect to="/login" />;
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-500 to-primary-700">
        <div className="bg-white rounded-xl shadow-2xl p-8">
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500"></div>
            <span className="text-gray-700">로딩 중...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Switch>
      {!isAuthenticated ? (
        <>
          <Route path="/login" component={Login} />
          <Route path="/register" component={Register} />
          <Route path="/" component={Login} />
          <Route component={RedirectToLogin} />
        </>
      ) : (
        <Layout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/customers" component={Customers} />
            <Route path="/customers/:id" component={CustomerDetail} />
            <Route path="/data-import" component={DataImport} />
            <Route path="/ars-campaigns" component={ArsCampaigns} />
            <Route path="/scenario-management" component={ScenarioManagement} />
            <Route path="/customer-groups" component={CustomerGroups} />
            <Route path="/users" component={Users} />
            <Route path="/settings" component={Settings} />
            <Route>
              <NotFound />
            </Route>
          </Switch>
        </Layout>
      )}
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
