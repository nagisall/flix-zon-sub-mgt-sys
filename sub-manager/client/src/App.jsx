import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Products from './pages/Products.jsx'
import QuotationTemplates from './pages/QuotationTemplates.jsx'
import Subscriptions from './pages/Subscriptions.jsx'
import Invoices from './pages/Invoices.jsx'
import TaxesDiscounts from './pages/TaxesDiscounts.jsx'
import Staff from './pages/Staff.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Protected routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/products"
          element={
            <ProtectedRoute roles={['admin', 'staff']}>
              <Products />
            </ProtectedRoute>
          }
        />
        <Route
          path="/quotes"
          element={
            <ProtectedRoute roles={['admin', 'staff']}>
              <QuotationTemplates />
            </ProtectedRoute>
          }
        />
        <Route
          path="/subscriptions"
          element={
            <ProtectedRoute>
              <Subscriptions />
            </ProtectedRoute>
          }
        />
        <Route
          path="/invoices"
          element={
            <ProtectedRoute>
              <Invoices />
            </ProtectedRoute>
          }
        />
        <Route
          path="/taxes-discounts"
          element={
            <ProtectedRoute roles={['admin']}>
              <TaxesDiscounts />
            </ProtectedRoute>
          }
        />
        <Route
          path="/staff"
          element={
            <ProtectedRoute roles={['admin']}>
              <Staff />
            </ProtectedRoute>
          }
        />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
