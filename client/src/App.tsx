import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./Layout";
import HomePage from "./pages/HomePage";
import OverviewPage from "./pages/OverviewPage";

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="overview" element={<OverviewPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
