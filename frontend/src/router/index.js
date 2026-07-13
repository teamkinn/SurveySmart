import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/AuthView.vue'),
    meta: { guest: true },
  },
  {
    path: '/reset-password',
    name: 'ResetPassword',
    component: () => import('@/views/ResetPasswordView.vue'),
    meta: { guest: true },
  },
  { path: '/fill/:token', name: 'Fill', component: () => import('@/views/SurveyFillView.vue') },
  {
    path: '/',
    component: () => import('@/views/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', name: 'Home', component: () => import('@/views/HomeView.vue') },
      { path: 'surveys', name: 'Surveys', component: () => import('@/views/SurveysView.vue') },
      { path: 'dashboard', name: 'Dashboard', component: () => import('@/views/DashboardView.vue') },
      { path: 'shared', name: 'Shared', component: () => import('@/views/SharedView.vue') },
      {
        path: 'surveys/:id/responses',
        name: 'Responses',
        component: () => import('@/views/ResponsesView.vue'),
      },
      {
        path: 'admin',
        name: 'Admin',
        component: () => import('@/views/AdminView.vue'),
        meta: { adminOnly: true },
      },
    ],
  },
  { path: '/:catchAll(.*)', redirect: '/' },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to, _, next) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.token) return next('/login');
  if (to.meta.guest && auth.token) return next('/');
  if (to.meta.adminOnly && !['admin', 'head_admin'].includes(auth.user?.role)) return next('/');
  next();
});

export default router;
