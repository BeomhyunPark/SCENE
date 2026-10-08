package app.scene.event.transfer;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Turns on scheduling for {@link DueHandoverJob} only. Tests set the property false and call the
 * job method themselves.
 */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProperty(name = "scene.handover.scheduler.enabled", matchIfMissing = true)
public class HandoverScheduling {}
