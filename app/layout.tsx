import type { Metadata } from 'next';
export const metadata:Metadata={title:'MedFlow ERP · 独立应用',description:'独立ERP业务系统，独立数据存储与消息协作。',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>}
