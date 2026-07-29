import './styles/main.css'
import { PPTController } from './js/ppt-controller.js'

// 页面加载完成后初始化
window.addEventListener('DOMContentLoaded', () => {
  // 初始化 PPT 控制器
  new PPTController()
})
