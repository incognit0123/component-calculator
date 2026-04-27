import { Badge, Card } from 'antd'
import type { ReactNode } from 'react'

interface Props {
  title: string
  children: ReactNode
  className?: string
  bodyClassName?: string
  extra?: ReactNode
}

export function PanelShell({
  title,
  children,
  className,
  bodyClassName,
  extra,
}: Props) {
  return (
    <Badge.Ribbon
      text={title}
      color="#4b5063"
      placement="start"
      className="ant-ribbon-wrapper"
    >
      <Card
        title={null}
        extra={extra}
        className={`panel-frame ${className ?? ''}`}
        styles={{
          body: {
            padding: 20,
            paddingTop: 24,
          },
        }}
      >
        <div className={bodyClassName}>{children}</div>
      </Card>
    </Badge.Ribbon>
  )
}
