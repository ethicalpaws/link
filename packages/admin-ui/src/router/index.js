import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', name: 'dashboard', component: () => import('../views/Dashboard.vue') },
  { path: '/agents', name: 'agents', component: () => import('../views/Agents.vue') },
  { path: '/tools', name: 'tools', component: () => import('../views/Tools.vue') },
  { path: '/llm', name: 'llm', component: () => import('../views/Llm.vue') },
  { path: '/memory', name: 'memory', component: () => import('../views/Memory.vue') },
  { path: '/plans', name: 'plans', component: () => import('../views/Plans.vue') },
  { path: '/skills', name: 'skills', component: () => import('../views/Skills.vue') },
  { path: '/scheduler', name: 'scheduler', component: () => import('../views/Scheduler.vue') },
  { path: '/mcp', name: 'mcp', component: () => import('../views/Mcp.vue') },
  { path: '/knowledge', name: 'knowledge', component: () => import('../views/Knowledge.vue') },
  { path: '/identity', name: 'identity', component: () => import('../views/Identity.vue') },
]

export default createRouter({
  history: createWebHistory('/admin/'),
  routes,
})
